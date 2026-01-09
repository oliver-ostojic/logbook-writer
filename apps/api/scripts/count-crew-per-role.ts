import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all roles with their crew counts
  const roles = await prisma.role.findMany({
    include: {
      CrewRole: {
        select: {
          crewId: true,
        },
      },
    },
    orderBy: { displayName: 'asc' },
  });

  console.log('\n📊 Crew count per role:\n');
  console.log('Role Name'.padEnd(30) + 'Crew Count');
  console.log('-'.repeat(45));

  let totalAssignments = 0;
  for (const role of roles) {
    const count = role.CrewRole.length;
    totalAssignments += count;
    console.log(`${(role.displayName || role.code).padEnd(30)} ${count}`);
  }

  console.log('-'.repeat(45));
  console.log(`${'Total role assignments:'.padEnd(30)} ${totalAssignments}`);
  
  // Also get unique crew count
  const uniqueCrew = await prisma.crew.count();
  console.log(`${'Total unique crew:'.padEnd(30)} ${uniqueCrew}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
});
