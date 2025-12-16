/**
 * Safe migration script to rename RoleRuleType enum values in Postgres.
 * 
 * Changes:
 *   MIN_BLOCKSIZE -> MIN_CONSECUTIVE_MINUTES
 *   MAX_BLOCKSIZE -> MAX_CONSECUTIVE_MINUTES
 * 
 * This preserves all existing data by:
 * 1. Adding the new enum values
 * 2. Updating existing rows that use old values
 * 3. Removing the old enum values
 * 
 * Run with: pnpm ts-node scripts/migrate-roleruletype-enum.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Starting RoleRuleType enum migration...\n');

  // Step 1: Check current enum values in Postgres
  console.log('Step 1: Checking current enum values...');
  const currentEnumValues = await prisma.$queryRaw<{ enumlabel: string }[]>`
    SELECT enumlabel 
    FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'RoleRuleType')
    ORDER BY enumsortorder;
  `;
  
  const enumLabels = currentEnumValues.map(r => r.enumlabel);
  console.log('  Current enum values:', enumLabels);

  const hasOldMinBlocksize = enumLabels.includes('MIN_BLOCKSIZE');
  const hasOldMaxBlocksize = enumLabels.includes('MAX_BLOCKSIZE');
  const hasNewMinConsecutive = enumLabels.includes('MIN_CONSECUTIVE_MINUTES');
  const hasNewMaxConsecutive = enumLabels.includes('MAX_CONSECUTIVE_MINUTES');

  if (!hasOldMinBlocksize && !hasOldMaxBlocksize) {
    if (hasNewMinConsecutive && hasNewMaxConsecutive) {
      console.log('\n✅ Enum already migrated! Nothing to do.');
      return;
    }
    console.log('\n⚠️  Old values not found and new values missing. Manual intervention needed.');
    return;
  }

  // Step 2: Add new enum values if they don't exist
  console.log('\nStep 2: Adding new enum values...');
  
  if (!hasNewMinConsecutive) {
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "RoleRuleType" ADD VALUE IF NOT EXISTS 'MIN_CONSECUTIVE_MINUTES';
    `);
    console.log('  Added MIN_CONSECUTIVE_MINUTES');
  } else {
    console.log('  MIN_CONSECUTIVE_MINUTES already exists');
  }

  if (!hasNewMaxConsecutive) {
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "RoleRuleType" ADD VALUE IF NOT EXISTS 'MAX_CONSECUTIVE_MINUTES';
    `);
    console.log('  Added MAX_CONSECUTIVE_MINUTES');
  } else {
    console.log('  MAX_CONSECUTIVE_MINUTES already exists');
  }

  // Step 3: Update existing RoleRule rows to use new values
  console.log('\nStep 3: Updating existing RoleRule rows...');

  // Check how many rows need updating (use raw SQL since old enum values aren't in Prisma schema)
  const minBlocksizeCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "RoleRule" WHERE type = 'MIN_BLOCKSIZE';
  `;
  const maxBlocksizeCount = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "RoleRule" WHERE type = 'MAX_BLOCKSIZE';
  `;

  const minCount = Number(minBlocksizeCount[0]?.count ?? 0);
  const maxCount = Number(maxBlocksizeCount[0]?.count ?? 0);

  console.log(`  Found ${minCount} rows with MIN_BLOCKSIZE`);
  console.log(`  Found ${maxCount} rows with MAX_BLOCKSIZE`);

  if (minCount > 0) {
    await prisma.$executeRaw`
      UPDATE "RoleRule" 
      SET type = 'MIN_CONSECUTIVE_MINUTES'::"RoleRuleType"
      WHERE type = 'MIN_BLOCKSIZE'::"RoleRuleType";
    `;
    console.log(`  Updated ${minCount} rows: MIN_BLOCKSIZE -> MIN_CONSECUTIVE_MINUTES`);
  }

  if (maxCount > 0) {
    await prisma.$executeRaw`
      UPDATE "RoleRule" 
      SET type = 'MAX_CONSECUTIVE_MINUTES'::"RoleRuleType"
      WHERE type = 'MAX_BLOCKSIZE'::"RoleRuleType";
    `;
    console.log(`  Updated ${maxCount} rows: MAX_BLOCKSIZE -> MAX_CONSECUTIVE_MINUTES`);
  }

  // Step 4: Remove old enum values
  // Note: Postgres doesn't support DROP VALUE for enums easily.
  // The safest approach is to recreate the type, but that requires column changes.
  // For now, we'll leave the old values (they won't be used) and let a future
  // prisma migrate handle the cleanup, or do it manually if needed.
  console.log('\nStep 4: Old enum values cleanup...');
  console.log('  ⚠️  Postgres does not easily support removing enum values.');
  console.log('  The old values (MIN_BLOCKSIZE, MAX_BLOCKSIZE) will remain in the enum');
  console.log('  but are no longer used. This is safe for production.');
  console.log('  A future `prisma migrate dev` can clean this up if needed.');

  // Verify final state
  console.log('\nStep 5: Verifying migration...');
  const finalCheck = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "RoleRule" 
    WHERE type IN ('MIN_BLOCKSIZE', 'MAX_BLOCKSIZE');
  `;
  const remaining = Number(finalCheck[0]?.count ?? 0);

  if (remaining === 0) {
    console.log('  ✅ No rows using old enum values. Migration successful!');
  } else {
    console.log(`  ❌ ${remaining} rows still using old values. Check for errors.`);
  }

  console.log('\n🎉 Migration complete!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
