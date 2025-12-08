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

async function dropColumnIfExists(table: string, column: string) {
  if (await columnExists(table, column)) {
    console.log(`Dropping ${table}.${column}...`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "${column}";`);
  } else {
    console.log(`Column ${table}.${column} already removed, skipping.`);
  }
}

async function main() {
  await dropColumnIfExists('Store', 'breakWindowStart');
  await dropColumnIfExists('Store', 'breakWindowEnd');

  console.log('Store break window columns removed (if they were present).');
}

main()
  .catch((err) => {
    console.error('Manual drop failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
