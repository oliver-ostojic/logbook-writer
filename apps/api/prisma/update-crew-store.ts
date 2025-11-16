import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Updating all crew members to store 768...');
  
  const result = await prisma.crewMember.updateMany({
    data: {
      storeId: 768,
    },
  });
  
  console.log(`✓ Updated ${result.count} crew members to storeId 768`);
  
  // Verify
  const sample = await prisma.crewMember.findMany({
    take: 3,
    select: {
      id: true,
      name: true,
      storeId: true,
    },
  });
  
  console.log('\nSample crew members:');
  sample.forEach(crew => {
    console.log(`  ${crew.name} (${crew.id}) - storeId: ${crew.storeId}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
