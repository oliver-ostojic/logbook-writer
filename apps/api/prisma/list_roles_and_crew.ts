import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Roles:');
  const roles = await prisma.role.findMany({});
  roles.forEach(x => {
    const role = x as any;
    console.log(`  ${role.name}${role.detail ? ` (${role.detail})` : ''}`);
  });

  console.log('\nCrew Members:');
  const crew = await prisma.crewMember.findMany({});
  crew.forEach(x => {
    console.log(`  ${x.id}: ${x.name}`);
  });

  await prisma.$disconnect();
}

main();
