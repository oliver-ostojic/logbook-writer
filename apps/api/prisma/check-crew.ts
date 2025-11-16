import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking crew members in database...\n');
  
  const crews = await prisma.crewMember.findMany({
    take: 5,
    include: {
      store: true,
    },
  });
  
  console.log(`Found ${crews.length} crew members:\n`);
  
  crews.forEach(crew => {
    console.log(`ID: ${crew.id}`);
    console.log(`Name: ${crew.name}`);
    console.log(`StoreId: ${crew.storeId}`);
    console.log(`Store: ${crew.store?.name || 'N/A'}`);
    console.log(`---`);
  });
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
