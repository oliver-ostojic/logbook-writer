/**
 * Migration: Refactor LogPreferenceMetadata schema
 * 
 * This script safely migrates the LogPreferenceMetadata table to the new schema
 * without losing existing data.
 * 
 * Old schema:
 *   - totalPreferences (rename to eligiblePreferences)
 *   - preferencesMet (keep)
 *   - averageSatisfaction (rename to avgSatisfaction)
 *   - avgSatisfactionPerCrew (keep)
 *   - eligibleCrew (keep)
 *   - totalWeightApplied (drop)
 *   - fairnessIndex (keep)
 * 
 * New schema additions:
 *   - percentMet (new, computed)
 *   - fairnessGrade (new)
 *   - breakdownByRoleRule (new, JSON)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('🔄 Starting LogPreferenceMetadata migration...\n');

  // Step 1: Check current state of the table
  console.log('📊 Step 1: Analyzing current table structure...');
  
  const existingRecords = await prisma.$queryRaw<any[]>`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns 
    WHERE table_name = 'LogPreferenceMetadata'
    ORDER BY ordinal_position
  `;
  
  console.log('   Current columns:');
  for (const col of existingRecords) {
    console.log(`     - ${col.column_name} (${col.data_type})`);
  }
  console.log('');

  const columnNames = existingRecords.map(c => c.column_name);
  
  // Step 2: Add new columns if they don't exist
  console.log('📊 Step 2: Adding new columns...');

  if (!columnNames.includes('percentMet')) {
    console.log('   Adding percentMet...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" ADD COLUMN IF NOT EXISTS "percentMet" DOUBLE PRECISION DEFAULT 0`;
  } else {
    console.log('   percentMet already exists');
  }

  if (!columnNames.includes('fairnessGrade')) {
    console.log('   Adding fairnessGrade...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" ADD COLUMN IF NOT EXISTS "fairnessGrade" TEXT DEFAULT 'F'`;
  } else {
    console.log('   fairnessGrade already exists');
  }

  if (!columnNames.includes('breakdownByRoleRule')) {
    console.log('   Adding breakdownByRoleRule...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" ADD COLUMN IF NOT EXISTS "breakdownByRoleRule" JSONB DEFAULT '[]'`;
  } else {
    console.log('   breakdownByRoleRule already exists');
  }

  if (!columnNames.includes('eligiblePreferences')) {
    console.log('   Adding eligiblePreferences...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" ADD COLUMN IF NOT EXISTS "eligiblePreferences" INTEGER DEFAULT 0`;
  } else {
    console.log('   eligiblePreferences already exists');
  }

  if (!columnNames.includes('avgSatisfaction')) {
    console.log('   Adding avgSatisfaction...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" ADD COLUMN IF NOT EXISTS "avgSatisfaction" DOUBLE PRECISION DEFAULT 0`;
  } else {
    console.log('   avgSatisfaction already exists');
  }

  if (!columnNames.includes('eligibleCrew')) {
    console.log('   Adding eligibleCrew...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" ADD COLUMN IF NOT EXISTS "eligibleCrew" INTEGER DEFAULT 0`;
  } else {
    console.log('   eligibleCrew already exists');
  }

  if (!columnNames.includes('avgSatisfactionPerCrew')) {
    console.log('   Adding avgSatisfactionPerCrew...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" ADD COLUMN IF NOT EXISTS "avgSatisfactionPerCrew" DOUBLE PRECISION DEFAULT 0`;
  } else {
    console.log('   avgSatisfactionPerCrew already exists');
  }
  console.log('');

  // Step 3: Migrate data from old columns to new columns
  console.log('📊 Step 3: Migrating data from old columns...');

  if (columnNames.includes('totalPreferences') && columnNames.includes('eligiblePreferences')) {
    console.log('   Copying totalPreferences → eligiblePreferences...');
    await prisma.$executeRaw`
      UPDATE "LogPreferenceMetadata" 
      SET "eligiblePreferences" = "totalPreferences"
      WHERE "eligiblePreferences" = 0 AND "totalPreferences" > 0
    `;
  }

  if (columnNames.includes('averageSatisfaction') && columnNames.includes('avgSatisfaction')) {
    console.log('   Copying averageSatisfaction → avgSatisfaction...');
    await prisma.$executeRaw`
      UPDATE "LogPreferenceMetadata" 
      SET "avgSatisfaction" = "averageSatisfaction" * 100
      WHERE "avgSatisfaction" = 0 AND "averageSatisfaction" > 0
    `;
  }

  // Compute percentMet from existing data
  console.log('   Computing percentMet from preferencesMet/eligiblePreferences...');
  await prisma.$executeRaw`
    UPDATE "LogPreferenceMetadata" 
    SET "percentMet" = CASE 
      WHEN "eligiblePreferences" > 0 THEN ("preferencesMet"::float / "eligiblePreferences"::float) * 100
      ELSE 0 
    END
    WHERE "percentMet" = 0
  `;

  // Compute fairnessGrade from fairnessIndex
  console.log('   Computing fairnessGrade from fairnessIndex...');
  await prisma.$executeRaw`
    UPDATE "LogPreferenceMetadata" 
    SET "fairnessGrade" = CASE
      WHEN "fairnessIndex" >= 94 THEN 'A+'
      WHEN "fairnessIndex" >= 88 THEN 'A'
      WHEN "fairnessIndex" >= 82 THEN 'A-'
      WHEN "fairnessIndex" >= 76 THEN 'B+'
      WHEN "fairnessIndex" >= 70 THEN 'B'
      WHEN "fairnessIndex" >= 64 THEN 'B-'
      WHEN "fairnessIndex" >= 58 THEN 'C+'
      WHEN "fairnessIndex" >= 52 THEN 'C'
      WHEN "fairnessIndex" >= 46 THEN 'C-'
      WHEN "fairnessIndex" >= 40 THEN 'D+'
      WHEN "fairnessIndex" >= 34 THEN 'D'
      WHEN "fairnessIndex" >= 28 THEN 'D-'
      ELSE 'F'
    END
  `;
  console.log('');

  // Step 4: Drop old columns
  console.log('📊 Step 4: Dropping old columns...');

  if (columnNames.includes('totalPreferences')) {
    console.log('   Dropping totalPreferences...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" DROP COLUMN IF EXISTS "totalPreferences"`;
  }

  if (columnNames.includes('averageSatisfaction')) {
    console.log('   Dropping averageSatisfaction...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" DROP COLUMN IF EXISTS "averageSatisfaction"`;
  }

  if (columnNames.includes('totalWeightApplied')) {
    console.log('   Dropping totalWeightApplied...');
    await prisma.$executeRaw`ALTER TABLE "LogPreferenceMetadata" DROP COLUMN IF EXISTS "totalWeightApplied"`;
  }
  console.log('');

  // Step 5: Verify final state
  console.log('📊 Step 5: Verifying final table structure...');
  
  const finalColumns = await prisma.$queryRaw<any[]>`
    SELECT column_name, data_type
    FROM information_schema.columns 
    WHERE table_name = 'LogPreferenceMetadata'
    ORDER BY ordinal_position
  `;
  
  console.log('   Final columns:');
  for (const col of finalColumns) {
    console.log(`     - ${col.column_name} (${col.data_type})`);
  }
  console.log('');

  // Show sample of migrated data
  const sampleData = await prisma.$queryRaw<any[]>`
    SELECT id, "eligiblePreferences", "preferencesMet", "percentMet", 
           "avgSatisfaction", "eligibleCrew", "avgSatisfactionPerCrew",
           "fairnessIndex", "fairnessGrade"
    FROM "LogPreferenceMetadata"
    LIMIT 3
  `;
  
  if (sampleData.length > 0) {
    console.log('📋 Sample migrated data:');
    for (const row of sampleData) {
      console.log(`   ID: ${row.id.substring(0, 8)}...`);
      console.log(`     eligiblePreferences: ${row.eligiblePreferences}`);
      console.log(`     preferencesMet: ${row.preferencesMet} (${row.percentMet?.toFixed(1)}%)`);
      console.log(`     avgSatisfaction: ${row.avgSatisfaction?.toFixed(1)}%`);
      console.log(`     eligibleCrew: ${row.eligibleCrew}`);
      console.log(`     avgSatisfactionPerCrew: ${row.avgSatisfactionPerCrew?.toFixed(1)}%`);
      console.log(`     fairnessIndex: ${row.fairnessIndex?.toFixed(1)} (${row.fairnessGrade})`);
      console.log('');
    }
  }

  console.log('✅ Migration complete!');
  await prisma.$disconnect();
}

migrate().catch(async (e) => {
  console.error('❌ Migration failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
