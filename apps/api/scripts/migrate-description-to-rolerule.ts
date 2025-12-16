/**
 * Move description field from CrewRoleRule/StoreRoleRule to RoleRule.
 * 
 * Run with: pnpm tsx scripts/migrate-description-to-rolerule.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Moving description field to RoleRule...\n');

  // Step 1: Add description column to RoleRule if not exists
  console.log('Step 1: Adding description column to RoleRule...');
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "RoleRule" ADD COLUMN IF NOT EXISTS "description" TEXT;
    `);
    console.log('  ✅ Added description column to RoleRule');
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      console.log('  ℹ️  description column already exists on RoleRule');
    } else {
      throw e;
    }
  }

  // Step 2: Copy descriptions from CrewRoleRule to RoleRule (if any exist)
  console.log('\nStep 2: Copying descriptions from CrewRoleRule...');
  const crewDescriptions = await prisma.$queryRaw<{ roleRuleId: number; description: string }[]>`
    SELECT DISTINCT "roleRuleId", "description" 
    FROM "CrewRoleRule" 
    WHERE "description" IS NOT NULL AND "description" != '';
  `;
  
  for (const row of crewDescriptions) {
    await prisma.$executeRaw`
      UPDATE "RoleRule" SET "description" = ${row.description}
      WHERE id = ${row.roleRuleId} AND ("description" IS NULL OR "description" = '');
    `;
  }
  console.log(`  ✅ Copied ${crewDescriptions.length} descriptions from CrewRoleRule`);

  // Step 3: Copy descriptions from StoreRoleRule to RoleRule (if any exist)
  console.log('\nStep 3: Copying descriptions from StoreRoleRule...');
  const storeDescriptions = await prisma.$queryRaw<{ roleRuleId: number; description: string }[]>`
    SELECT DISTINCT "roleRuleId", "description" 
    FROM "StoreRoleRule" 
    WHERE "description" IS NOT NULL AND "description" != '';
  `;
  
  for (const row of storeDescriptions) {
    await prisma.$executeRaw`
      UPDATE "RoleRule" SET "description" = ${row.description}
      WHERE id = ${row.roleRuleId} AND ("description" IS NULL OR "description" = '');
    `;
  }
  console.log(`  ✅ Copied ${storeDescriptions.length} descriptions from StoreRoleRule`);

  // Step 4: Drop description columns from link tables
  console.log('\nStep 4: Dropping description columns from link tables...');
  
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "CrewRoleRule" DROP COLUMN IF EXISTS "description";
  `);
  console.log('  ✅ Dropped description from CrewRoleRule');
  
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "StoreRoleRule" DROP COLUMN IF EXISTS "description";
  `);
  console.log('  ✅ Dropped description from StoreRoleRule');

  console.log('\n🎉 Migration complete! Now update prisma/schema.prisma and run prisma generate.');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
