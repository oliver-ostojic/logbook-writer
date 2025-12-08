const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRoles() {
  // Check all roles with their assignment models
  const roles = await prisma.role.findMany({
    where: {
      CrewRole: {
        some: {
          Crew: {
            Shift: {
              some: {
                date: new Date('2025-11-25'),
                storeId: 768
              }
            }
          }
        }
      }
    },
    select: {
      id: true,
      code: true,
      displayName: true,
      assignmentModel: true,
      CrewRole: {
        where: {
          Crew: {
            Shift: {
              some: {
                date: new Date('2025-11-25'),
                storeId: 768
              }
            }
          }
        },
        select: {
          crewId: true
        }
      }
    }
  });

  console.log('Roles with crew that have shifts on 2025-11-25:');
  console.log('=================================================\n');
  
  roles.forEach(role => {
    console.log(`Role: ${role.displayName} (${role.code})`);
    console.log(`  ID: ${role.id}`);
    console.log(`  Assignment Models: ${role.assignmentModel ? JSON.stringify(role.assignmentModel) : 'null'}`);
    console.log(`  Crew count: ${role.CrewRole.length}`);
    console.log(`  Has COVERAGE_WINDOW: ${role.assignmentModel && role.assignmentModel.includes('COVERAGE_WINDOW')}`);
    console.log('');
  });
  
  await prisma.$disconnect();
}

checkRoles().catch(console.error);
