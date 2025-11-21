import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function convertCrewIdsToStrings() {
  console.log('Starting crew ID conversion...');

  // PostgreSQL can alter column types with existing data if it's a compatible cast
  // Let's try altering the columns directly
  try {
    await prisma.$executeRaw`ALTER TABLE "Crew" ALTER COLUMN "id" TYPE varchar(7)`;
    await prisma.$executeRaw`ALTER TABLE "CrewRole" ALTER COLUMN "crewId" TYPE varchar(7)`;
    await prisma.$executeRaw`ALTER TABLE "CrewRoleRequirement" ALTER COLUMN "crewId" TYPE varchar(7)`;
    await prisma.$executeRaw`ALTER TABLE "Task" ALTER COLUMN "crewId" TYPE varchar(7)`;

    // Now pad the values to 7 characters
    await prisma.$executeRaw`
      UPDATE "Crew"
      SET "id" = LPAD("id", 7, '0')
    `;

    await prisma.$executeRaw`
      UPDATE "CrewRole"
      SET "crewId" = LPAD("crewId", 7, '0')
    `;

    await prisma.$executeRaw`
      UPDATE "CrewRoleRequirement"
      SET "crewId" = LPAD("crewId", 7, '0')
    `;

    await prisma.$executeRaw`
      UPDATE "Task"
      SET "crewId" = LPAD("crewId", 7, '0')
    `;

    console.log('Crew ID conversion completed successfully');
  } catch (error) {
    console.error('Error during conversion:', error);
    throw error;
  }
}

convertCrewIdsToStrings()
  .catch(console.error)
  .finally(() => prisma.$disconnect());