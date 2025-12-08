import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function enumLabelExists(enumName: string, label: string) {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = ${enumName}
        AND e.enumlabel = ${label}
    ) AS "exists";
  `;
  return Boolean(rows[0]?.exists);
}

async function renameEnumValue(enumName: string, fromLabel: string, toLabel: string) {
  const hasFrom = await enumLabelExists(enumName, fromLabel);
  if (!hasFrom) {
    console.log(`Enum value ${fromLabel} not found on ${enumName}, skipping rename.`);
    return;
  }

  const hasTo = await enumLabelExists(enumName, toLabel);
  if (hasTo) {
    console.log(`${enumName}.${toLabel} already exists. Updating roles that still reference ${fromLabel}...`);
    await prisma.$executeRawUnsafe(`
      UPDATE "Role"
      SET "assignmentModel" = array_replace("assignmentModel", '${fromLabel}', '${toLabel}');
    `);
    console.log('Replaced existing role metadata values.');
    return;
  }

  console.log(`Renaming ${enumName}.${fromLabel} -> ${toLabel}...`);
  await prisma.$executeRawUnsafe(`ALTER TYPE "${enumName}" RENAME VALUE '${fromLabel}' TO '${toLabel}';`);
  console.log('Rename complete.');
}

async function main() {
  await renameEnumValue('AssignmentModel', 'NONE', 'SOLVER');
}

main()
  .catch((err) => {
    console.error('Failed to rename enum value:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
