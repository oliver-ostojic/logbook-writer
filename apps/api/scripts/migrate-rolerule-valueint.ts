/**
 * Migration: Add valueInt to RoleRule for hour-based rules
 * 
 * Problem: Rules like CANNOT_ASSIGN_DURING_STORE_HOUR_X need multiple entries
 * for the same role (one per forbidden hour), but the current unique constraint
 * @@unique([roleId, type, targetRoleId]) prevents this.
 * 
 * Solution: Add valueInt to RoleRule and include it in the unique constraint.
 * This allows:
 *   - RoleRule(roleId=30, type=CANNOT_ASSIGN_DURING_STORE_HOUR_X, valueInt=540) -- forbid 09:00
 *   - RoleRule(roleId=30, type=CANNOT_ASSIGN_DURING_STORE_HOUR_X, valueInt=600) -- forbid 10:00
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Migration: Add valueInt to RoleRule unique constraint\n');

  // Step 1: Check current state
  const existingRoleRules = await prisma.roleRule.findMany({
    orderBy: { id: 'asc' },
  });
  console.log(`Existing RoleRules: ${existingRoleRules.length}`);

  // Step 2: Drop the old unique constraint
  console.log('\n1. Dropping old unique constraint...');
  try {
    await prisma.$executeRaw`
      ALTER TABLE "RoleRule" DROP CONSTRAINT IF EXISTS "RoleRule_roleId_type_targetRoleId_key"
    `;
    console.log('   ✅ Dropped old constraint');
  } catch (e: any) {
    console.log(`   ⚠️  Constraint may not exist: ${e.message}`);
  }

  // Step 3: Add valueInt column if it doesn't exist
  console.log('\n2. Adding valueInt column to RoleRule...');
  try {
    await prisma.$executeRaw`
      ALTER TABLE "RoleRule" ADD COLUMN IF NOT EXISTS "valueInt" INTEGER
    `;
    console.log('   ✅ Added valueInt column');
  } catch (e: any) {
    console.log(`   ⚠️  Column may already exist: ${e.message}`);
  }

  // Step 4: Create new unique constraint including valueInt
  console.log('\n3. Creating new unique constraint with valueInt...');
  try {
    // Drop any existing index first
    await prisma.$executeRaw`
      DROP INDEX IF EXISTS "RoleRule_roleId_type_targetRoleId_valueInt_key"
    `;
    
    // Create unique index with COALESCE to handle NULLs
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX "RoleRule_roleId_type_targetRoleId_valueInt_key" 
      ON "RoleRule" ("roleId", "type", COALESCE("targetRoleId", 0), COALESCE("valueInt", 0))
    `;
    console.log('   ✅ Created new unique constraint');
  } catch (e: any) {
    console.log(`   ❌ Error: ${e.message}`);
  }

  // Step 5: Verify
  console.log('\n4. Verifying...');
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'RoleRule' AND column_name = 'valueInt'
  `;
  
  if (columns.length > 0) {
    console.log('   ✅ valueInt column exists in RoleRule');
  } else {
    console.log('   ❌ valueInt column NOT found');
  }

  const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes 
    WHERE tablename = 'RoleRule' AND indexname LIKE '%valueInt%'
  `;
  
  if (indexes.length > 0) {
    console.log(`   ✅ New unique index exists: ${indexes[0].indexname}`);
  } else {
    console.log('   ❌ New unique index NOT found');
  }

  console.log('\n✅ Migration complete!');
  console.log('\nNow update your schema.prisma to match:');
  console.log(`
model RoleRule {
  id             Int             @id @default(autoincrement())
  roleId         Int
  type           RoleRuleType
  targetRoleId   Int?
  valueInt       Int?            // NEW: For hour-based rules
  constraintType ConstraintType
  description    String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  ...

  @@unique([roleId, type, targetRoleId, valueInt])  // UPDATED
  @@index([roleId])
}
  `);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
