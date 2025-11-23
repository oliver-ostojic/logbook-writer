import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const allCrews = await prisma.crew.findMany({
    orderBy: { id: 'asc' }
  });
  
  const testCrews = allCrews.filter(c => 
    c.id.startsWith('PREF') || 
    c.id.startsWith('TCREW') || 
    c.id.startsWith('TUN') || 
    c.id.startsWith('TCRW')
  );
  
  console.log(`\nFound ${testCrews.length} test crew members:\n`);
  testCrews.forEach(c => console.log(`- ${c.id}: ${c.name}`));
  
  console.log(`\nTotal crew members in DB: ${allCrews.length}`);
}

main()
  .finally(() => prisma.$disconnect());
