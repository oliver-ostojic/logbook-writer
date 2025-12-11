import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addCodePDFColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "codePDF" VARCHAR(255);
  `);
  console.log('codePDF column added to Role table');
}

addCodePDFColumn().finally(() => prisma.$disconnect());
