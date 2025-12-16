/**
 * Manual migration script for RoleRule tables
 * Run with: pnpm ts-node scripts/migrate-role-rules.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Starting RoleRule migration...\n");

  // 0. Create ConstraintType enum if not exists
  console.log("0. Creating ConstraintType enum...");
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ConstraintType" AS ENUM ('HARD', 'SOFT');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log("   ✅ ConstraintType enum ready\n");

  // 1. Create RoleRuleType enum if not exists
  console.log("1. Creating RoleRuleType enum...");
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "RoleRuleType" AS ENUM (
        'CANNOT_BE_ASSIGNED_BEFORE',
        'CANNOT_BE_ASSIGNED_AFTER',
        'MIN_CONSECUTIVE_MINUTES',
        'MAX_CONSECUTIVE_MINUTES',
        'FORBID_ROLE',
        'TIMING',
        'LIKE_ROLE_FOR_HOUR_X',
        'DISLIKE_ROLE_FOR_HOUR_X',
        'MIN_SHIFT_LENGTH_FOR_ACCESS',
        'MAX_CONSECUTIVE_MINUTES_ON_ROLE',
        'ASSIGN_BEFORE_SHIFT_MIN_X',
        'ASSIGN_AFTER_SHIFT_MIN_X',
        'MAX_CREW_ON_AT_A_TIME',
        'ALLOW_HALF_BLOCKSIZE',
        'DISTRIBUTION_BETWEEN_ROLE_X'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  console.log("   ✅ RoleRuleType enum ready\n");

  // 2. Create RoleRule table if not exists
  console.log("2. Creating RoleRule table...");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RoleRule" (
      "id" SERIAL PRIMARY KEY,
      "roleId" INTEGER NOT NULL,
      "type" "RoleRuleType" NOT NULL,
      "targetRoleId" INTEGER,
      "valueInt" INTEGER,
      "constraintType" "ConstraintType" NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RoleRule_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "RoleRule_targetRoleId_fkey" FOREIGN KEY ("targetRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);

  // Add unique constraint if not exists
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "RoleRule" ADD CONSTRAINT "RoleRule_roleId_type_targetRoleId_key" 
        UNIQUE ("roleId", "type", "targetRoleId");
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Add index if not exists
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RoleRule_roleId_idx" ON "RoleRule"("roleId");
  `);
  console.log("   ✅ RoleRule table ready\n");

  // 3. Create CrewRoleRule table if not exists
  console.log("3. Creating CrewRoleRule table...");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CrewRoleRule" (
      "id" SERIAL PRIMARY KEY,
      "crewId" CHAR(7) NOT NULL,
      "roleRuleId" INTEGER NOT NULL,
      "isPriority" BOOLEAN NOT NULL DEFAULT false,
      "description" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "CrewRoleRule_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "CrewRoleRule_roleRuleId_fkey" FOREIGN KEY ("roleRuleId") REFERENCES "RoleRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  // Add unique constraint if not exists
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "CrewRoleRule" ADD CONSTRAINT "CrewRoleRule_crewId_roleRuleId_key" 
        UNIQUE ("crewId", "roleRuleId");
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Add index if not exists
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "CrewRoleRule_crewId_idx" ON "CrewRoleRule"("crewId");
  `);
  console.log("   ✅ CrewRoleRule table ready\n");

  // 4. Create StoreRoleRule table if not exists
  console.log("4. Creating StoreRoleRule table...");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StoreRoleRule" (
      "id" SERIAL PRIMARY KEY,
      "storeId" INTEGER NOT NULL,
      "roleRuleId" INTEGER NOT NULL,
      "isPriority" BOOLEAN NOT NULL DEFAULT false,
      "description" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StoreRoleRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "StoreRoleRule_roleRuleId_fkey" FOREIGN KEY ("roleRuleId") REFERENCES "RoleRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  // Add unique constraint if not exists
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "StoreRoleRule" ADD CONSTRAINT "StoreRoleRule_storeId_roleRuleId_key" 
        UNIQUE ("storeId", "roleRuleId");
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Add index if not exists
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "StoreRoleRule_storeId_idx" ON "StoreRoleRule"("storeId");
  `);
  console.log("   ✅ StoreRoleRule table ready\n");

  // 5. Verify tables exist
  console.log("5. Verifying tables...");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN ('RoleRule', 'CrewRoleRule', 'StoreRoleRule');
  `;
  console.log("   Found tables:", tables.map((t) => t.tablename).join(", "));

  console.log("\n✅ Migration complete!");
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
