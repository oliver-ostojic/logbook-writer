import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Get ORDER_WRITER role
  const owRole = await prisma.role.findUnique({
    where: { code: 'ORDER_WRITER' }
  });
  
  if (!owRole) {
    console.log('❌ ORDER_WRITER role not found');
    return;
  }
  
  // Crew IDs that need ORDER_WRITER (based on the target list)
  const crewToAdd = [
    { id: '1289515', name: 'Adam Carey' },
    { id: '1285308', name: 'Hannah Reshel' },
    { id: '1283622', name: 'Ashley Andrejko' },
    { id: '1280703', name: 'Denise Madrid' },
    { id: '1281990', name: 'Matthew Studebaker' },
    { id: '1283065', name: 'Rachel Haverstock' },
    { id: '1281859', name: 'Savannah Fraijo' },
    { id: '1289093', name: 'Taylor Yackulics' },
    { id: '1283995', name: 'Vaughn Diana' },
    { id: '1280059', name: 'Wade Davis' }
  ];
  
  console.log(`Adding ORDER_WRITER role to ${crewToAdd.length} crew members:\n`);
  
  for (const crew of crewToAdd) {
    try {
      await prisma.crewRole.create({
        data: {
          crewId: crew.id,
          roleId: owRole.id,
          crewName: crew.name,
          roleName: 'ORDER_WRITER',
          specialization: null
        }
      });
      console.log(`✅ Added ${crew.name}`);
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`⚠️  ${crew.name} already has ORDER_WRITER`);
      } else {
        console.log(`❌ Error adding ${crew.name}: ${error.message}`);
      }
    }
  }
  
  // Verify total count
  const totalOW = await prisma.crewRole.count({
    where: { role: { code: 'ORDER_WRITER' } }
  });
  
  console.log(`\n✅ Total ORDER_WRITER crew: ${totalOW}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
