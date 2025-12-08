const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    console.log('Step 1: Creating ConsecutivePolicy enum...');
    await p.$executeRawUnsafe(`
      CREATE TYPE "ConsecutivePolicy" AS ENUM ('REQUIRED', 'PREFERRED', 'NONE');
    `);
    console.log('✓ Enum created');

    console.log('\nStep 2: Adding consecutivePolicy and consecutiveWeight columns...');
    await p.$executeRawUnsafe(`
      ALTER TABLE "Role" 
      ADD COLUMN "consecutivePolicy" "ConsecutivePolicy" DEFAULT 'NONE',
      ADD COLUMN "consecutiveWeight" DOUBLE PRECISION DEFAULT 1.0;
    `);
    console.log('✓ Columns added');

    console.log('\nStep 3: Dropping old slotsMustBeConsecutive column...');
    await p.$executeRawUnsafe(`
      ALTER TABLE "Role" DROP COLUMN "slotsMustBeConsecutive";
    `);
    console.log('✓ Old column dropped');

    console.log('\n✅ Migration complete! All roles now have consecutivePolicy = NONE by default.');
    console.log('   Update specific roles manually via Prisma Studio or SQL.');
  } catch (e) {
    console.error('Error during migration:', e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
