const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    console.log('Adding SOLVER to AssignmentModel enum (if missing)...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'AssignmentModel'
            AND e.enumlabel = 'SOLVER'
        ) THEN
          ALTER TYPE "AssignmentModel" ADD VALUE 'SOLVER';
        END IF;
      END;
      $$;
    `);
    console.log('✓ Ensured SOLVER exists on AssignmentModel enum.');
  } catch (err) {
    console.error('Error adding enum value:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
