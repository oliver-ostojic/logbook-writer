/**
 * Remove deprecated enum values from RoleRuleType by recreating the enum.
 * 
 * This is the only safe way to remove values from a Postgres enum.
 * 
 * Run with: pnpm tsx scripts/cleanup-roleruletype-enum.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Cleaning up RoleRuleType enum...\n');

  // Step 1: Verify no rows use the old values
  console.log('Step 1: Checking for rows using deprecated values...');
  const oldValueRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) as count FROM "RoleRule" 
    WHERE type IN ('MIN_BLOCKSIZE', 'MAX_BLOCKSIZE', 'MAX_CONSECUTIVE_MINUTES_ON_ROLE');
  `;
  const count = Number(oldValueRows[0]?.count ?? 0);

  if (count > 0) {
    console.log(`  ❌ Found ${count} rows still using old values. Cannot proceed.`);
    console.log('  Run migrate-roleruletype-enum.ts first to update these rows.');
    return;
  }
  console.log('  ✅ No rows using deprecated values.');

  // Step 2: Create new enum type with only the valid values
  console.log('\nStep 2: Creating new enum type...');
  await prisma.$executeRawUnsafe(`
    CREATE TYPE "RoleRuleType_new" AS ENUM (
      'CANNOT_BE_ASSIGNED_BEFORE',
      'CANNOT_BE_ASSIGNED_AFTER',
      'MIN_CONSECUTIVE_MINUTES',
      'MAX_CONSECUTIVE_MINUTES',
      'FORBID_ROLE',
      'TIMING',
      'LIKE_ROLE_FOR_HOUR_X',
      'DISLIKE_ROLE_FOR_HOUR_X',
      'MIN_SHIFT_LENGTH_FOR_ACCESS',
      'ASSIGN_BEFORE_SHIFT_MIN_X',
      'ASSIGN_AFTER_SHIFT_MIN_X',
      'MAX_CREW_ON_AT_A_TIME',
      'ALLOW_HALF_BLOCKSIZE',
      'DISTRIBUTION_BETWEEN_ROLE_X'
    );
  `);
  console.log('  ✅ Created RoleRuleType_new');

  // Step 3: Alter the column to use the new enum type
  console.log('\nStep 3: Altering RoleRule.type column...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RoleRule" 
    ALTER COLUMN "type" TYPE "RoleRuleType_new" 
    USING "type"::text::"RoleRuleType_new";
  `);
  console.log('  ✅ Column updated to use new enum');

  // Step 4: Drop the old enum type
  console.log('\nStep 4: Dropping old enum type...');
  await prisma.$executeRawUnsafe(`DROP TYPE "RoleRuleType";`);
  console.log('  ✅ Dropped old RoleRuleType');

  // Step 5: Rename new enum to original name
  console.log('\nStep 5: Renaming new enum to RoleRuleType...');
  await prisma.$executeRawUnsafe(`ALTER TYPE "RoleRuleType_new" RENAME TO "RoleRuleType";`);
  console.log('  ✅ Renamed to RoleRuleType');

  // Verify
  console.log('\nStep 6: Verifying final enum values...');
  const finalValues = await prisma.$queryRaw<{ enumlabel: string }[]>`
    SELECT enumlabel FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'RoleRuleType')
    ORDER BY enumsortorder;
  `;
  console.log('  Final enum values:', finalValues.map(r => r.enumlabel));

  console.log('\n🎉 Cleanup complete! Deprecated enum values removed.');
}

main()
  .catch((e) => {
    console.error('Cleanup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
