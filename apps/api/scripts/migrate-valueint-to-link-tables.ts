/**
 * Migration: Move valueInt from RoleRule to StoreRoleRule/CrewRoleRule
 * 
 * This script:
 * 1. Adds valueInt column to StoreRoleRule and CrewRoleRule
 * 2. Copies any existing valueInt data from RoleRule to linked tables
 * 3. Drops valueInt from RoleRule
 * 
 * Run with: npx ts-node scripts/migrate-valueint-to-link-tables.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Migrating valueInt to link tables ===\n');

  // Step 1: Check current state
  console.log('Step 1: Checking current column state...');
  
  const storeRuleColumns: any[] = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'StoreRoleRule'
  `;
  const hasValueIntOnStoreRule = storeRuleColumns.some((c: any) => c.column_name === 'valueInt');
  
  const crewRuleColumns: any[] = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'CrewRoleRule'
  `;
  const hasValueIntOnCrewRule = crewRuleColumns.some((c: any) => c.column_name === 'valueInt');
  
  const roleRuleColumns: any[] = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'RoleRule'
  `;
  const hasValueIntOnRoleRule = roleRuleColumns.some((c: any) => c.column_name === 'valueInt');
  
  console.log(`  - StoreRoleRule has valueInt: ${hasValueIntOnStoreRule}`);
  console.log(`  - CrewRoleRule has valueInt: ${hasValueIntOnCrewRule}`);
  console.log(`  - RoleRule has valueInt: ${hasValueIntOnRoleRule}`);

  // Step 2: Add valueInt to StoreRoleRule if not present
  if (!hasValueIntOnStoreRule) {
    console.log('\nStep 2a: Adding valueInt to StoreRoleRule...');
    await prisma.$executeRaw`
      ALTER TABLE "StoreRoleRule" 
      ADD COLUMN "valueInt" INTEGER
    `;
    console.log('  ✅ Added valueInt to StoreRoleRule');
  } else {
    console.log('\nStep 2a: StoreRoleRule already has valueInt, skipping.');
  }

  // Step 3: Add valueInt to CrewRoleRule if not present
  if (!hasValueIntOnCrewRule) {
    console.log('\nStep 2b: Adding valueInt to CrewRoleRule...');
    await prisma.$executeRaw`
      ALTER TABLE "CrewRoleRule" 
      ADD COLUMN "valueInt" INTEGER
    `;
    console.log('  ✅ Added valueInt to CrewRoleRule');
  } else {
    console.log('\nStep 2b: CrewRoleRule already has valueInt, skipping.');
  }

  // Step 4: Migrate existing data from RoleRule to StoreRoleRule
  if (hasValueIntOnRoleRule) {
    console.log('\nStep 3: Migrating existing valueInt data...');
    
    // Copy valueInt to StoreRoleRule for linked rules
    const storeUpdated = await prisma.$executeRaw`
      UPDATE "StoreRoleRule" srr
      SET "valueInt" = rr."valueInt"
      FROM "RoleRule" rr
      WHERE srr."roleRuleId" = rr.id
        AND rr."valueInt" IS NOT NULL
        AND srr."valueInt" IS NULL
    `;
    console.log(`  - Updated ${storeUpdated} StoreRoleRule rows`);
    
    // Copy valueInt to CrewRoleRule for linked rules
    const crewUpdated = await prisma.$executeRaw`
      UPDATE "CrewRoleRule" crr
      SET "valueInt" = rr."valueInt"
      FROM "RoleRule" rr
      WHERE crr."roleRuleId" = rr.id
        AND rr."valueInt" IS NOT NULL
        AND crr."valueInt" IS NULL
    `;
    console.log(`  - Updated ${crewUpdated} CrewRoleRule rows`);
  } else {
    console.log('\nStep 3: No valueInt on RoleRule to migrate.');
  }

  // Step 5: Drop valueInt from RoleRule
  if (hasValueIntOnRoleRule) {
    console.log('\nStep 4: Dropping valueInt from RoleRule...');
    await prisma.$executeRaw`
      ALTER TABLE "RoleRule" 
      DROP COLUMN IF EXISTS "valueInt"
    `;
    console.log('  ✅ Dropped valueInt from RoleRule');
  } else {
    console.log('\nStep 4: RoleRule already missing valueInt, skipping.');
  }

  console.log('\n=== Migration complete! ===');
  
  // Verify final state
  console.log('\nFinal column state:');
  const finalStoreColumns: any[] = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'StoreRoleRule'
  `;
  console.log('  StoreRoleRule:', finalStoreColumns.map((c: any) => c.column_name));
  
  const finalCrewColumns: any[] = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'CrewRoleRule'
  `;
  console.log('  CrewRoleRule:', finalCrewColumns.map((c: any) => c.column_name));
  
  const finalRoleRuleColumns: any[] = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'RoleRule'
  `;
  console.log('  RoleRule:', finalRoleRuleColumns.map((c: any) => c.column_name));
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
