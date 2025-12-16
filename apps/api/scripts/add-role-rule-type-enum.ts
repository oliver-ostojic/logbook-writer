import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const NEW_ENUM_VALUE = 'CANNOT_ASSIGN_DURING_STORE_HOUR_X';
  const ENUM_NAME = 'RoleRuleType';

  console.log(`Adding '${NEW_ENUM_VALUE}' to enum '${ENUM_NAME}'...`);

  // Check if the value already exists
  const checkResult = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = ${NEW_ENUM_VALUE}
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = ${ENUM_NAME})
    ) as exists
  `;

  if (checkResult[0]?.exists) {
    console.log(`✅ '${NEW_ENUM_VALUE}' already exists in '${ENUM_NAME}'. Nothing to do.`);
    return;
  }

  // Add the new enum value
  await prisma.$executeRawUnsafe(`
    ALTER TYPE "${ENUM_NAME}" ADD VALUE '${NEW_ENUM_VALUE}'
  `);

  console.log(`✅ Successfully added '${NEW_ENUM_VALUE}' to enum '${ENUM_NAME}'`);

  // Verify
  const verifyResult = await prisma.$queryRaw<{ enumlabel: string }[]>`
    SELECT enumlabel FROM pg_enum 
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = ${ENUM_NAME})
    ORDER BY enumsortorder
  `;

  console.log(`\nCurrent values in '${ENUM_NAME}':`);
  verifyResult.forEach((row, i) => console.log(`  ${i + 1}. ${row.enumlabel}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
