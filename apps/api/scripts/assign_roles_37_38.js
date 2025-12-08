const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const assignments = [
  {
    roleId: 38,
    crewNames: [
      'Rachel Haverstock',
      'Alyssa Jenkins',
      'Esteban Espinosa',
      'Smith Jean Jacques',
      'Ashley Andrejko',
      'Talye DeMaio',
      'Jodie Cordato',
    ],
  },
  {
    roleId: 37,
    crewNames: [
      'Carolyn Shephard',
      'Justin Bennett',
      'Shushan Royer',
      'Randy Guardado',
    ],
  },
];

(async () => {
  try {
    console.log('Assigning roles to specified crew...\n');
    
    for (const { roleId, crewNames } of assignments) {
      // Get the role
      const role = await p.role.findUnique({
        where: { id: roleId },
        select: { id: true, code: true, displayName: true },
      });
      
      if (!role) {
        console.error(`❌ Role with ID ${roleId} not found!`);
        continue;
      }
      
      console.log(`Role ${roleId}: ${role.code} - ${role.displayName}`);
      
      let added = 0;
      let skipped = 0;
      let notFound = 0;
      
      for (const name of crewNames) {
        // Find crew by partial name match
        const crew = await p.crew.findFirst({
          where: { name: { contains: name, mode: 'insensitive' } },
        });
        
        if (!crew) {
          console.log(`  ❌ Not found: ${name}`);
          notFound++;
          continue;
        }
        
        try {
          await p.crewRole.create({
            data: {
              crewId: crew.id,
              roleId: role.id,
              crewName: crew.name,
              roleName: role.displayName,
            },
          });
          console.log(`  ✓ Added to ${crew.name}`);
          added++;
        } catch (e) {
          if (e.code === 'P2002') {
            console.log(`  ⊘ Already exists: ${crew.name}`);
            skipped++;
          } else {
            throw e;
          }
        }
      }
      
      console.log(`  Summary: ${added} added, ${skipped} skipped, ${notFound} not found\n`);
    }
    
    console.log('✅ Done!');
  } catch (e) {
    console.error('Error:', e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
