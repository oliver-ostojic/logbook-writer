/**
 * Migration script: Minutes-based schema refactor
 * 
 * This migrates from the old slot/block/hour-based constraint system to the new minutes-based system.
 * 
 * Changes:
 * 1. Store: Remove baseSlotMinutes
 * 2. Role: 
 *    - Remove: minSlots, maxSlots, blockSize
 *    - Add: displayCode, taskLength, familyId
 *    - Change: assignmentModel from array to single value, update enum values
 * 3. Drop old tables: HourlyRoleConstraint, WindowRoleConstraint, DailyRoleConstraint
 * 4. Create new tables: RoleFamily, RoleCoverageWindow, CrewRoleQuota
 * 5. Update AssignmentModel enum: HOURLY->WINDOW, HOURLY_WINDOW->WINDOW (merged)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting minutes-based schema migration...\n');

  // ============================================================
  // PHASE 1: Add enum value (must be committed separately)
  // ============================================================
  console.log('=== PHASE 1: Add WINDOW enum value ===');
  console.log('1. Adding WINDOW to AssignmentModel enum...');
  
  await prisma.$executeRawUnsafe(`
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'WINDOW' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AssignmentModel')) THEN
        ALTER TYPE "AssignmentModel" ADD VALUE 'WINDOW';
      END IF;
    END $$;
  `);
  
  console.log('   Enum value added and committed.\n');

  // ============================================================
  // PHASE 2: Everything else in a transaction
  // ============================================================
  console.log('=== PHASE 2: Schema changes ===');
  
  await prisma.$transaction(async (tx) => {
    // ============================================================
    // STEP 1: Create RoleFamily table
    // ============================================================
    console.log('2. Creating RoleFamily table...');
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RoleFamily" (
        "id" SERIAL PRIMARY KEY,
        "name" TEXT NOT NULL UNIQUE,
        "minMinutes" INTEGER NOT NULL,
        "maxMinutes" INTEGER NOT NULL,
        "companyId" INTEGER NOT NULL REFERENCES "Company"("id")
      );
    `);

    // ============================================================
    // STEP 2: Insert default role families (one per company)
    // ============================================================
    console.log('3. Inserting default role families...');
    const companies = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Company"`;
    
    for (const company of companies) {
      // Check if families already exist for this company
      const existingFamilies = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "RoleFamily" WHERE "companyId" = ${company.id}
      `;
      
      if (Number(existingFamilies[0].count) === 0) {
        // Create default families with reasonable defaults
        await tx.$executeRawUnsafe(`
          INSERT INTO "RoleFamily" ("name", "minMinutes", "maxMinutes", "companyId")
          VALUES 
            ('DEFAULT', 0, 480, ${company.id})
          ON CONFLICT ("name") DO NOTHING;
        `);
      }
    }

    // ============================================================
    // STEP 3: Add new columns to Role table
    // ============================================================
    console.log('4. Adding new columns to Role table...');
    
    // Add displayCode column
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      ADD COLUMN IF NOT EXISTS "displayCode" TEXT;
    `);
    
    // Set displayCode = code for existing rows
    await tx.$executeRawUnsafe(`
      UPDATE "Role" SET "displayCode" = "code" WHERE "displayCode" IS NULL;
    `);
    
    // Make displayCode NOT NULL
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      ALTER COLUMN "displayCode" SET NOT NULL;
    `);

    // Add taskLength column (default 60 minutes)
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      ADD COLUMN IF NOT EXISTS "taskLength" INTEGER DEFAULT 60;
    `);
    
    // Calculate taskLength from old minSlots * baseSlotMinutes (default 30)
    await tx.$executeRawUnsafe(`
      UPDATE "Role" r
      SET "taskLength" = COALESCE(r."minSlots", 1) * COALESCE(
        (SELECT s."baseSlotMinutes" FROM "Store" s WHERE s."id" = r."storeId"), 
        30
      )
      WHERE "taskLength" = 60 OR "taskLength" IS NULL;
    `);
    
    // Make taskLength NOT NULL
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      ALTER COLUMN "taskLength" SET NOT NULL,
      ALTER COLUMN "taskLength" DROP DEFAULT;
    `);

    // Add familyId column
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      ADD COLUMN IF NOT EXISTS "familyId" INTEGER;
    `);

    // Set familyId to the DEFAULT family for each store's company
    await tx.$executeRawUnsafe(`
      UPDATE "Role" r
      SET "familyId" = (
        SELECT rf."id" 
        FROM "RoleFamily" rf
        JOIN "Store" s ON s."companyId" = rf."companyId"
        WHERE s."id" = r."storeId"
        LIMIT 1
      )
      WHERE "familyId" IS NULL;
    `);

    // Add foreign key constraint
    await tx.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'Role_familyId_fkey' AND table_name = 'Role'
        ) THEN
          ALTER TABLE "Role" 
          ADD CONSTRAINT "Role_familyId_fkey" 
          FOREIGN KEY ("familyId") REFERENCES "RoleFamily"("id");
        END IF;
      END $$;
    `);
    
    // Make familyId NOT NULL
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      ALTER COLUMN "familyId" SET NOT NULL;
    `);

    // ============================================================
    // STEP 4: Convert assignmentModel from array to single value
    // ============================================================
    console.log('5. Converting assignmentModel from array to single value...');
    
    // Create a temporary column for the new single value
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      ADD COLUMN IF NOT EXISTS "assignmentModel_new" "AssignmentModel";
    `);
    
    // Migrate data: take first element of array, convert HOURLY/HOURLY_WINDOW to WINDOW
    await tx.$executeRawUnsafe(`
      UPDATE "Role"
      SET "assignmentModel_new" = CASE
        WHEN "assignmentModel"[1] IN ('HOURLY', 'HOURLY_WINDOW') THEN 'WINDOW'::"AssignmentModel"
        WHEN "assignmentModel"[1] = 'DAILY' THEN 'DAILY'::"AssignmentModel"
        WHEN "assignmentModel"[1] = 'SOLVER' THEN 'SOLVER'::"AssignmentModel"
        ELSE 'WINDOW'::"AssignmentModel"
      END;
    `);
    
    // Drop old column and rename new one
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" DROP COLUMN "assignmentModel";
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" RENAME COLUMN "assignmentModel_new" TO "assignmentModel";
    `);
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" ALTER COLUMN "assignmentModel" SET NOT NULL;
    `);

    // ============================================================
    // STEP 5: Remove deprecated columns from Role
    // ============================================================
    console.log('6. Removing deprecated columns from Role...');
    
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      DROP COLUMN IF EXISTS "minSlots",
      DROP COLUMN IF EXISTS "maxSlots",
      DROP COLUMN IF EXISTS "blockSize";
    `);

    // ============================================================
    // STEP 6: Remove baseSlotMinutes from Store
    // ============================================================
    console.log('7. Removing baseSlotMinutes from Store...');
    
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Store" 
      DROP COLUMN IF EXISTS "baseSlotMinutes";
    `);

    // ============================================================
    // STEP 7: Create RoleCoverageWindow table
    // ============================================================
    console.log('8. Creating RoleCoverageWindow table...');
    
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RoleCoverageWindow" (
        "id" SERIAL PRIMARY KEY,
        "date" TIMESTAMP(3) NOT NULL,
        "startMin" INTEGER NOT NULL,
        "endMin" INTEGER NOT NULL,
        "crewPerTaskLength" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "storeId" INTEGER NOT NULL REFERENCES "Store"("id"),
        "roleId" INTEGER NOT NULL REFERENCES "Role"("id"),
        UNIQUE("storeId", "roleId", "date", "startMin", "endMin")
      );
    `);
    
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "RoleCoverageWindow_storeId_date_idx" 
      ON "RoleCoverageWindow"("storeId", "date");
    `);

    // ============================================================
    // STEP 8: Migrate HourlyRoleConstraint -> RoleCoverageWindow
    // ============================================================
    console.log('9. Migrating HourlyRoleConstraint data to RoleCoverageWindow...');
    
    // Check if HourlyRoleConstraint exists
    const hourlyExists = await tx.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'HourlyRoleConstraint'
      );
    `;
    
    if (hourlyExists[0].exists) {
      // Each hourly constraint becomes a 1-hour window (hour*60 to (hour+1)*60)
      await tx.$executeRawUnsafe(`
        INSERT INTO "RoleCoverageWindow" ("date", "startMin", "endMin", "crewPerTaskLength", "storeId", "roleId", "createdAt", "updatedAt")
        SELECT 
          h."date",
          h."hour" * 60 as "startMin",
          (h."hour" + 1) * 60 as "endMin",
          h."requiredPerHour" as "crewPerTaskLength",
          h."storeId",
          h."roleId",
          h."createdAt",
          CURRENT_TIMESTAMP
        FROM "HourlyRoleConstraint" h
        ON CONFLICT ("storeId", "roleId", "date", "startMin", "endMin") DO NOTHING;
      `);
    }

    // ============================================================
    // STEP 9: Migrate WindowRoleConstraint -> RoleCoverageWindow
    // ============================================================
    console.log('10. Migrating WindowRoleConstraint data to RoleCoverageWindow...');
    
    const windowExists = await tx.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'WindowRoleConstraint'
      );
    `;
    
    if (windowExists[0].exists) {
      // Window constraints already have start/end hours
      await tx.$executeRawUnsafe(`
        INSERT INTO "RoleCoverageWindow" ("date", "startMin", "endMin", "crewPerTaskLength", "storeId", "roleId", "createdAt", "updatedAt")
        SELECT 
          w."date",
          w."startHour" * 60 as "startMin",
          w."endHour" * 60 as "endMin",
          w."requiredPerHour" as "crewPerTaskLength",
          w."storeId",
          w."roleId",
          w."createdAt",
          CURRENT_TIMESTAMP
        FROM "WindowRoleConstraint" w
        ON CONFLICT ("storeId", "roleId", "date", "startMin", "endMin") DO NOTHING;
      `);
    }

    // ============================================================
    // STEP 10: Create CrewRoleQuota table
    // ============================================================
    console.log('11. Creating CrewRoleQuota table...');
    
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "CrewRoleQuota" (
        "id" SERIAL PRIMARY KEY,
        "date" TIMESTAMP(3) NOT NULL,
        "startMin" INTEGER NOT NULL,
        "endMin" INTEGER NOT NULL,
        "requiredMin" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "storeId" INTEGER NOT NULL REFERENCES "Store"("id"),
        "crewId" CHAR(7) NOT NULL REFERENCES "Crew"("id"),
        "roleId" INTEGER NOT NULL REFERENCES "Role"("id"),
        UNIQUE("storeId", "date", "crewId", "roleId")
      );
    `);
    
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "CrewRoleQuota_storeId_date_idx" 
      ON "CrewRoleQuota"("storeId", "date");
    `);

    // ============================================================
    // STEP 11: Migrate DailyRoleConstraint -> CrewRoleQuota
    // ============================================================
    console.log('12. Migrating DailyRoleConstraint data to CrewRoleQuota...');
    
    const dailyExists = await tx.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'DailyRoleConstraint'
      );
    `;
    
    if (dailyExists[0].exists) {
      // Daily constraints: convert hours to minutes, use store hours as window
      await tx.$executeRawUnsafe(`
        INSERT INTO "CrewRoleQuota" ("date", "startMin", "endMin", "requiredMin", "storeId", "crewId", "roleId", "createdAt", "updatedAt")
        SELECT 
          d."date",
          s."openMinutesFromMidnight" as "startMin",
          s."closeMinutesFromMidnight" as "endMin",
          ROUND(d."requiredHours" * 60)::INTEGER as "requiredMin",
          d."storeId",
          d."crewId",
          d."roleId",
          d."createdAt",
          CURRENT_TIMESTAMP
        FROM "DailyRoleConstraint" d
        JOIN "Store" s ON s."id" = d."storeId"
        ON CONFLICT ("storeId", "date", "crewId", "roleId") DO NOTHING;
      `);
    }

    // ============================================================
    // STEP 12: Drop old constraint tables
    // ============================================================
    console.log('13. Dropping old constraint tables...');
    
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "HourlyRoleConstraint" CASCADE;`);
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "WindowRoleConstraint" CASCADE;`);
    await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS "DailyRoleConstraint" CASCADE;`);

    console.log('14. Migration complete!');
  });

  console.log('\n✅ Migration completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Run: npx prisma generate');
  console.log('2. Test the application');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
