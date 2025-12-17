/**
 * Add HOURLY_AND_SOLVER to the AssignmentModel enum in PostgreSQL.
 * This avoids needing a Prisma migration that would drop and recreate the enum.
 * 
 * Run with: npx ts-node scripts/add-hourly-and-solver-enum.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding HOURLY_AND_SOLVER to AssignmentModel enum...');
  
  try {
    // Check if the value already exists
    const existing = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AssignmentModel')
      AND enumlabel = 'HOURLY_AND_SOLVER'
    `;
    
    if (existing.length > 0) {
      console.log('✅ HOURLY_AND_SOLVER already exists in AssignmentModel enum');
      return;
    }
    
    // Add the new enum value
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "AssignmentModel" ADD VALUE 'HOURLY_AND_SOLVER'
    `);
    
    console.log('✅ Successfully added HOURLY_AND_SOLVER to AssignmentModel enum');
    
    // Verify it was added
    const values = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AssignmentModel')
      ORDER BY enumsortorder
    `;
    
    console.log('Current AssignmentModel enum values:');
    values.forEach(v => console.log(`  - ${v.enumlabel}`));
    
  } catch (error) {
    console.error('❌ Error adding enum value:', error);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
