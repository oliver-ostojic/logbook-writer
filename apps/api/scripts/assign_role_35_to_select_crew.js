const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const roleId = 35;
const crewNames = [
  'Cheri Reimann',
  'Denise Madrid',
  'Gary Medina',
  'Savannah Fraijo',
  'Xander Faber',
  'Roger Gomez',
  'Ashley Andrejko',
  'Crystal Rosa',
  'Garet Reimann',
  'Kaylyn Pipitone',
  'Wade Davis',
  'Taylor Yackulics',
  'Adam Levi',
  'Luki Ahmad',
  'Matthew Studebaker',
  'Ofelia Aguirre',
];

(async () => {
  try {
    console.log(`Adding role ID ${roleId} to specified crew...`);
    
    // Get the role
    const role = await p.role.findUnique({
      where: { id: roleId },
      select: { id: true, code: true, displayName: true },
    });
    
    if (!role) {
      console.error(`Role with ID ${roleId} not found!`);
      process.exitCode = 1;
      return;
    }
    
    console.log(`Role: ${role.code} - ${role.displayName}\n`);
    
    let added = 0;
    let skipped = 0;
    let notFound = 0;
    
    for (const name of crewNames) {
      // Find crew by partial name match
      const crew = await p.crew.findFirst({
        where: { name: { contains: name, mode: 'insensitive' } },
      });
      
      if (!crew) {
        console.log(`❌ Not found: ${name}`);
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
        console.log(`✓ Added to ${crew.name}`);
        added++;
      } catch (e) {
        if (e.code === 'P2002') {
          console.log(`⊘ Already exists: ${crew.name}`);
          skipped++;
        } else {
          throw e;
        }
      }
    }
    
    console.log(`\n✅ Done! Added ${added}, skipped ${skipped}, not found ${notFound}.`);
  } catch (e) {
    console.error('Error:', e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
