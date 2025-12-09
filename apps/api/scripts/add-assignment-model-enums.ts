/**
 * Add HOURLY and HOURLY_OR_WINDOW back to AssignmentModel enum
 * 
 * Run: npx ts-node scripts/add-assignment-model-enums.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding HOURLY and HOURLY_OR_WINDOW to AssignmentModel enum...\n');

  // Add new enum values to AssignmentModel
  // PostgreSQL allows adding values to an enum
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "AssignmentModel" ADD VALUE IF NOT EXISTS 'HOURLY';
    `);
    console.log('✅ Added HOURLY to AssignmentModel enum');
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      console.log('ℹ️  HOURLY already exists in AssignmentModel enum');
    } else {
      throw e;
    }
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "AssignmentModel" ADD VALUE IF NOT EXISTS 'HOURLY_OR_WINDOW';
    `);
    console.log('✅ Added HOURLY_OR_WINDOW to AssignmentModel enum');
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      console.log('ℹ️  HOURLY_OR_WINDOW already exists in AssignmentModel enum');
    } else {
      throw e;
    }
  }

  // Verify the enum values
  const enumValues = await prisma.$queryRawUnsafe(`
    SELECT enumlabel FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AssignmentModel')
    ORDER BY enumsortorder;
  `) as any[];

  console.log('\n📋 Current AssignmentModel enum values:');
  enumValues.forEach((row: any, i: number) => {
    console.log(`  ${i + 1}. ${row.enumlabel}`);
  });

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
