const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    console.log('Converting assignmentModel from single enum to array...');
    await p.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      ALTER COLUMN "assignmentModel" 
      SET DATA TYPE "AssignmentModel"[] 
      USING ARRAY["assignmentModel"]::"AssignmentModel"[]
    `);
    console.log('✓ Column converted successfully. Existing data preserved as single-element arrays.');
  } catch (e) {
    console.error('Error converting column:', e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
