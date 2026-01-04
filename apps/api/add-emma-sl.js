const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const storeId = 768;
  
  const crew = await prisma.crew.findFirst({
    where: { storeId, name: { contains: 'Emma', mode: 'insensitive' } },
    include: { CrewRole: { include: { Role: true } } }
  });
  
  if (!crew) {
    console.log('Emma not found');
    return;
  }
  
  console.log('Found:', crew.name, '(' + crew.id + ')');
  console.log('Current roles:', crew.CrewRole.map(cr => cr.Role.displayName).join(', '));
  
  const hasSL = crew.CrewRole.some(cr => cr.roleId === 35);
  if (hasSL) {
    console.log('Already has Section Leader!');
    return;
  }
  
  await prisma.crewRole.create({
    data: {
      crewId: crew.id,
      roleId: 35,
      crewName: crew.name,
      roleName: ''
    }
  });
  
  console.log('✅ Added Section Leader role!');
}
main().finally(() => prisma.$disconnect());
