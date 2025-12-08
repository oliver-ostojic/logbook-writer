const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    console.log('Adding NONE to AssignmentModel enum...');
    await p.$executeRawUnsafe(`
      ALTER TYPE "AssignmentModel" ADD VALUE 'NONE';
    `);
    console.log('✓ Successfully added NONE to AssignmentModel enum.');
  } catch (e) {
    console.error('Error adding enum value:', e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
