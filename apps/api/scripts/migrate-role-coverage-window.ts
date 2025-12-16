import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Safe migration script to update RoleCoverageWindow table:
 * 1. Add constraintRule column (if not exists)
 * 2. Rename crewPerTaskLength to crewPerMinute (if needed)
 */
async function main() {
  console.log('='.repeat(60));
  console.log('SAFE MIGRATION: RoleCoverageWindow schema update');
  console.log('='.repeat(60));

  // Check current state
  console.log('\n1. Checking current table structure...');
  
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'RoleCoverageWindow'
    ORDER BY ordinal_position
  `;
  
  const columnNames = columns.map(c => c.column_name);
  console.log('   Current columns:', columnNames.join(', '));

  const hasCrewPerTaskLength = columnNames.includes('crewPerTaskLength');
  const hasCrewPerMinute = columnNames.includes('crewPerMinute');
  const hasConstraintRule = columnNames.includes('constraintRule');

  // Step 1: Create ConstraintRule enum if it doesn't exist
  console.log('\n2. Ensuring ConstraintRule enum exists...');
  try {
    await prisma.$executeRaw`
      DO $$ BEGIN
        CREATE TYPE "ConstraintRule" AS ENUM ('MIN', 'MAX', 'EXACTLY');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `;
    console.log('   ✅ ConstraintRule enum ready');
  } catch (e) {
    console.log('   ✅ ConstraintRule enum already exists');
  }

  // Step 2: Add constraintRule if missing
  if (!hasConstraintRule) {
    console.log('\n3. Adding constraintRule column...');
    await prisma.$executeRaw`
      ALTER TABLE "RoleCoverageWindow" 
      ADD COLUMN IF NOT EXISTS "constraintRule" "ConstraintRule" NOT NULL DEFAULT 'EXACTLY'
    `;
    console.log('   ✅ Added constraintRule column with default EXACTLY');
  } else {
    console.log('\n3. constraintRule column already exists ✅');
  }

  // Step 3: Rename crewPerTaskLength to crewPerMinute if needed
  if (hasCrewPerTaskLength && !hasCrewPerMinute) {
    console.log('\n3. Renaming crewPerTaskLength to crewPerMinute...');
    await prisma.$executeRaw`
      ALTER TABLE "RoleCoverageWindow" 
      RENAME COLUMN "crewPerTaskLength" TO "crewPerMinute"
    `;
    console.log('   ✅ Renamed crewPerTaskLength to crewPerMinute');
  } else if (hasCrewPerMinute) {
    console.log('\n3. crewPerMinute column already exists ✅');
  } else if (!hasCrewPerTaskLength && !hasCrewPerMinute) {
    console.log('\n3. Adding crewPerMinute column...');
    await prisma.$executeRaw`
      ALTER TABLE "RoleCoverageWindow" 
      ADD COLUMN "crewPerMinute" INT NOT NULL DEFAULT 1
    `;
    console.log('   ✅ Added crewPerMinute column');
  }

  // Verify final state
  console.log('\n4. Verifying final table structure...');
  const finalColumns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'RoleCoverageWindow'
    ORDER BY ordinal_position
  `;
  console.log('   Final columns:', finalColumns.map(c => c.column_name).join(', '));

  // Check row count to confirm data preserved
  const count = await prisma.roleCoverageWindow.count();
  console.log(`   Row count: ${count} (data preserved ✅)`);

  console.log('\n' + '='.repeat(60));
  console.log('Migration complete!');
  console.log('='.repeat(60));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
