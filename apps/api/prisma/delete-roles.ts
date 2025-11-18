import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteRoles() {
  console.log('Deleting duplicate roles...');
  
  try {
    // Delete DeMo role
    const demoResult = await prisma.role.deleteMany({
      where: { name: 'DeMo' }
    });
    console.log(`✓ Deleted ${demoResult.count} role(s) named "DeMo"`);
  } catch (error: any) {
    console.error(`✗ Failed to delete DeMo:`, error.message);
  }

  try {
    // Delete DuplicateTest role
    const dupResult = await prisma.role.deleteMany({
      where: { name: 'DuplicateTest' }
    });
    console.log(`✓ Deleted ${dupResult.count} role(s) named "DuplicateTest"`);
  } catch (error: any) {
    console.error(`✗ Failed to delete DuplicateTest:`, error.message);
  }

  console.log('\nDeletion complete!');
}

deleteRoles()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
