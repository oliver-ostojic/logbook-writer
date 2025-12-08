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

async function addRoleMinShiftColumn() {
  const columnName = 'minShiftLengthForRoleAccess';
  const tableName = 'Role';

  if (await columnExists(tableName, columnName)) {
    console.log(`Column ${tableName}.${columnName} already exists, skipping add.`);
    return;
  }

  console.log(`Adding ${tableName}.${columnName} (INTEGER, nullable)...`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "${tableName}"
    ADD COLUMN "${columnName}" INTEGER;
  `);
  console.log('Role column added.');
}

async function dropStoreBreakColumn() {
  const columnName = 'reqShiftLengthForBreak';
  const tableName = 'Store';

  if (!(await columnExists(tableName, columnName))) {
    console.log(`Column ${tableName}.${columnName} already removed, skipping drop.`);
    return;
  }

  console.log(`Dropping ${tableName}.${columnName}...`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "${tableName}"
    DROP COLUMN "${columnName}";
  `);
  console.log('Store column dropped.');
}

async function main() {
  await addRoleMinShiftColumn();
  await dropStoreBreakColumn();
  console.log('Role min-shift migration complete.');
}

main()
  .catch((err) => {
    console.error('Manual role min-shift migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
