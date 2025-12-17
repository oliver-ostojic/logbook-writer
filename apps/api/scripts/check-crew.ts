import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCrew() {
  // Check if Thalia exists
  const thalia = await prisma.crew.findUnique({ 
    where: { id: '1290542' },
    include: { CrewRole: { include: { Role: true } } }
  });
  console.log('Thalia (1290542):', JSON.stringify(thalia, null, 2));
  
  // Count total crew for store 768
  const count = await prisma.crew.count({ where: { storeId: 768 } });
  console.log('\nTotal crew in store 768:', count);

  // List all crew for store 768
  const allCrew = await prisma.crew.findMany({ 
    where: { storeId: 768 },
    include: { CrewRole: { include: { Role: true } } },
    orderBy: { name: 'asc' }
  });
  console.log('\nAll crew in store 768:');
  for (const c of allCrew) {
    const roles = c.CrewRole.map(cr => cr.Role.code).join(', ');
    console.log(`  ${c.id} - ${c.name} [${roles || 'NO ROLES'}]`);
  }
}

checkCrew()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
