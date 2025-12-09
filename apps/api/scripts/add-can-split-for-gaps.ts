/**
 * Add canSplitForGaps column to Role table
 * 
 * This column indicates whether a role can be split into smaller chunks
 * to fill gaps. For example, PRODUCT is normally a 60-min task but can
 * be split to 30-min to fill gaps.
 * 
 * Run: pnpm ts-node scripts/add-can-split-for-gaps.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding canSplitForGaps column to Role table...\n');

  // Add the column with default false
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Role" 
    ADD COLUMN IF NOT EXISTS "canSplitForGaps" BOOLEAN NOT NULL DEFAULT false;
  `);
  console.log('✅ Added canSplitForGaps column');

  // Set canSplitForGaps = true for DAILY roles (PRODUCT, ART, SL)
  // These are the roles that are normally 60-min but can fill 30-min gaps
  const dailyRoleCodes = ['PRODUCT', 'ART', 'SL'];
  
  const result = await prisma.$executeRawUnsafe(`
    UPDATE "Role" 
    SET "canSplitForGaps" = true 
    WHERE code IN ('PRODUCT', 'ART', 'SL');
  `);
  console.log(`✅ Set canSplitForGaps = true for ${dailyRoleCodes.join(', ')}`);

  // Verify the changes
  const roles = await prisma.$queryRawUnsafe(`
    SELECT code, "taskLength", "canSplitForGaps", "assignmentModel"
    FROM "Role"
    ORDER BY code;
  `) as any[];

  console.log('\n📋 Current Role configuration:');
  console.table(roles);

  console.log('\n✅ Migration complete!');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
