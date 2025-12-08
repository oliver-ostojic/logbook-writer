import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function columnExists(tableName: string, columnName: string) {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists";
  `;

  return Boolean(rows[0]?.exists);
}

async function ensureConsecutivePolicyEnum() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      CREATE TYPE "ConsecutivePolicy" AS ENUM ('REQUIRED', 'PREFERRED', 'NONE');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
    $$;
  `);
}

async function ensureAssignmentModelEnumValue() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'AssignmentModel' AND e.enumlabel = 'SOLVER'
      ) THEN
        ALTER TYPE "AssignmentModel" ADD VALUE 'SOLVER';
      END IF;
    END;
    $$;
  `);
}

async function ensureConsecutivePolicyColumn() {
  const hasColumn = await columnExists('Role', 'consecutivePolicy');
  if (!hasColumn) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Role"
      ADD COLUMN "consecutivePolicy" "ConsecutivePolicy" NOT NULL DEFAULT 'NONE';
    `);
  }

  const hasLegacyColumn = await columnExists('Role', 'slotsMustBeConsecutive');
  if (hasLegacyColumn) {
    await prisma.$executeRawUnsafe(`
      UPDATE "Role"
      SET "consecutivePolicy" = CASE WHEN "slotsMustBeConsecutive" THEN 'REQUIRED' ELSE 'NONE' END;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Role"
      DROP COLUMN "slotsMustBeConsecutive";
    `);
  }
}

async function dropConsecutiveWeightIfPresent() {
  const hasColumn = await columnExists('Role', 'consecutiveWeight');
  if (hasColumn) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Role" DROP COLUMN "consecutiveWeight";
    `);
  }
}

async function ensureWindowOffsetColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "windowStartOffsetMin" INTEGER;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "windowEndOffsetMin" INTEGER;
  `);
}

async function main() {
  console.log('Ensuring ConsecutivePolicy enum exists...');
  await ensureConsecutivePolicyEnum();

  console.log('Ensuring AssignmentModel enum includes SOLVER...');
  await ensureAssignmentModelEnumValue();

  console.log('Updating Role table consecutive fields...');
  await ensureConsecutivePolicyColumn();
  await dropConsecutiveWeightIfPresent();

  console.log('Adding window offset columns...');
  await ensureWindowOffsetColumns();

  console.log('Manual migration completed successfully.');
}

main()
  .catch((err) => {
    console.error('Manual migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
