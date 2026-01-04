/**
 * Manual database migration script for fairness schema updates.
 * 
 * This script:
 * 1. Modifies CrewRoleFairnessHistory to use 'date' instead of windowStart/windowEnd
 * 2. Creates the new RoleFairnessSnapshot table
 * 
 * Run with: pnpm ts-node apps/api/scripts/update-fairness-schema.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Updating fairness schema...\n');

  // Step 1: Check if we need to modify CrewRoleFairnessHistory
  console.log('1️⃣ Checking CrewRoleFairnessHistory table...');
  
  try {
    // Check if 'date' column exists
    const dateColumnExists = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'CrewRoleFairnessHistory' 
        AND column_name = 'date'
      ) as exists
    `;
    
    if (dateColumnExists[0]?.exists) {
      console.log('   ✅ "date" column already exists');
    } else {
      console.log('   📝 Adding "date" column...');
      
      // Check if windowStart exists (old schema)
      const windowStartExists = await prisma.$queryRaw<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'CrewRoleFairnessHistory' 
          AND column_name = 'windowStart'
        ) as exists
      `;
      
      if (windowStartExists[0]?.exists) {
        // Migrate from old schema: copy windowStart to date, then drop old columns
        console.log('   📝 Migrating from windowStart/windowEnd to date...');
        
        await prisma.$executeRaw`
          ALTER TABLE "CrewRoleFairnessHistory" 
          ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3)
        `;
        
        // Copy windowStart to date
        await prisma.$executeRaw`
          UPDATE "CrewRoleFairnessHistory" 
          SET "date" = "windowStart" 
          WHERE "date" IS NULL
        `;
        
        // Make date NOT NULL
        await prisma.$executeRaw`
          ALTER TABLE "CrewRoleFairnessHistory" 
          ALTER COLUMN "date" SET NOT NULL
        `;
        
        // Drop old columns
        await prisma.$executeRaw`
          ALTER TABLE "CrewRoleFairnessHistory" 
          DROP COLUMN IF EXISTS "windowStart",
          DROP COLUMN IF EXISTS "windowEnd",
          DROP COLUMN IF EXISTS "lookbackDays"
        `;
        
        console.log('   ✅ Migrated to date column');
      } else {
        // Fresh install: just add the date column
        await prisma.$executeRaw`
          ALTER TABLE "CrewRoleFairnessHistory" 
          ADD COLUMN "date" TIMESTAMP(3) NOT NULL DEFAULT NOW()
        `;
        console.log('   ✅ Added date column');
      }
    }
    
    // Drop old unique constraint if exists and create new one
    console.log('   📝 Updating unique constraint...');
    
    // Try to drop old constraint (may not exist)
    try {
      await prisma.$executeRaw`
        ALTER TABLE "CrewRoleFairnessHistory" 
        DROP CONSTRAINT IF EXISTS "CrewRoleFairnessHistory_storeId_roleId_crewId_windowEnd_key"
      `;
    } catch (e) {
      // Ignore if doesn't exist
    }
    
    // Create new unique constraint
    try {
      await prisma.$executeRaw`
        ALTER TABLE "CrewRoleFairnessHistory" 
        ADD CONSTRAINT "CrewRoleFairnessHistory_storeId_roleId_crewId_date_key" 
        UNIQUE ("storeId", "roleId", "crewId", "date")
      `;
      console.log('   ✅ Created unique constraint on (storeId, roleId, crewId, date)');
    } catch (e: any) {
      if (e.message?.includes('already exists')) {
        console.log('   ✅ Unique constraint already exists');
      } else {
        throw e;
      }
    }
    
    // Create index if not exists
    try {
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "CrewRoleFairnessHistory_storeId_roleId_date_idx" 
        ON "CrewRoleFairnessHistory" ("storeId", "roleId", "date")
      `;
      console.log('   ✅ Index on (storeId, roleId, date) ready');
    } catch (e) {
      // Ignore if exists
    }
    
  } catch (error) {
    console.error('   ❌ Error updating CrewRoleFairnessHistory:', error);
    throw error;
  }

  // Step 2: Create RoleFairnessSnapshot table
  console.log('\n2️⃣ Creating RoleFairnessSnapshot table...');
  
  try {
    // Check if table exists
    const tableExists = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'RoleFairnessSnapshot'
      ) as exists
    `;
    
    if (tableExists[0]?.exists) {
      console.log('   ✅ Table already exists');
    } else {
      await prisma.$executeRaw`
        CREATE TABLE "RoleFairnessSnapshot" (
          "id" SERIAL PRIMARY KEY,
          "storeId" INTEGER NOT NULL,
          "roleId" INTEGER NOT NULL,
          "date" TIMESTAMP(3) NOT NULL,
          
          -- Fairness metrics (normalized by days worked)
          "giniCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "fairnessIndex" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "fairnessGrade" TEXT NOT NULL DEFAULT 'F',
          
          -- Distribution stats (minutes per day worked)
          "minMinutesPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "maxMinutesPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "avgMinutesPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "stdDeviation" DOUBLE PRECISION NOT NULL DEFAULT 0,
          
          -- Counts
          "eligibleCrew" INTEGER NOT NULL DEFAULT 0,
          "crewWithMinutes" INTEGER NOT NULL DEFAULT 0,
          "lookbackDays" INTEGER NOT NULL DEFAULT 14,
          
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          
          -- Foreign keys
          CONSTRAINT "RoleFairnessSnapshot_roleId_fkey" 
            FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          CONSTRAINT "RoleFairnessSnapshot_storeId_fkey" 
            FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
          
          -- Unique constraint
          CONSTRAINT "RoleFairnessSnapshot_storeId_roleId_date_key" 
            UNIQUE ("storeId", "roleId", "date")
        )
      `;
      console.log('   ✅ Table created');
      
      // Create index
      await prisma.$executeRaw`
        CREATE INDEX "RoleFairnessSnapshot_storeId_roleId_date_idx" 
        ON "RoleFairnessSnapshot" ("storeId", "roleId", "date")
      `;
      console.log('   ✅ Index created');
    }
  } catch (error) {
    console.error('   ❌ Error creating RoleFairnessSnapshot:', error);
    throw error;
  }

  console.log('\n✅ Schema update complete!');
  console.log('\n📌 Next steps:');
  console.log('   1. Run: cd apps/api && npx prisma db pull');
  console.log('   2. Run: cd apps/api && npx prisma generate');
  console.log('   3. Verify schema.prisma matches expected structure');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
