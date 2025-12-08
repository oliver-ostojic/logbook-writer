import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting DailyRoleConstraint.requiredHours migration...');

  const alters = `
    ALTER TABLE "DailyRoleConstraint"
    ALTER COLUMN "requiredHours"
    TYPE DOUBLE PRECISION
    USING "requiredHours"::double precision;
  `;

  await prisma.$executeRawUnsafe(alters);

  console.log('Column type updated to DOUBLE PRECISION.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('Migration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
