const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const roleIds = [29, 30, 33, 36];

(async () => {
  try {
    console.log('Adding roles to all crew...');
    
    // Get all roles to display names
    const roles = await p.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, code: true, displayName: true },
    });
    
    console.log('Roles to assign:', roles.map(r => `${r.code} (${r.id})`).join(', '));
    
    // Get all crew
    const allCrew = await p.crew.findMany();
    console.log(`Found ${allCrew.length} crew members`);
    
    let added = 0;
    let skipped = 0;
    
    for (const crew of allCrew) {
      for (const role of roles) {
        try {
          await p.crewRole.create({
            data: {
              crewId: crew.id,
              roleId: role.id,
              crewName: crew.name,
              roleName: role.displayName,
            },
          });
          added++;
        } catch (e) {
          // Skip if already exists (duplicate key error)
          if (e.code === 'P2002') {
            skipped++;
          } else {
            throw e;
          }
        }
      }
      console.log(`✓ Processed ${crew.name}`);
    }
    
    console.log(`\n✅ Done! Added ${added} role assignments, skipped ${skipped} duplicates.`);
  } catch (e) {
    console.error('Error adding roles:', e);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
