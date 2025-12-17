import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;

// Role codes to ensure all crew have
const REQUIRED_ROLE_CODES = ['REG', 'PROD', 'P_HELM', 'BRK'];

async function addMissingBasicRoles() {
  console.log('Adding missing basic roles to all crew...\n');

  // Find the required roles
  const roles = await prisma.role.findMany({
    where: { 
      storeId: STORE_ID,
      code: { in: REQUIRED_ROLE_CODES }
    }
  });

  console.log('Found roles:');
  for (const role of roles) {
    console.log(`  ${role.code}: id=${role.id}, name="${role.displayName}"`);
  }

  // Check if all required roles were found
  const foundCodes = new Set(roles.map(r => r.code));
  const missingCodes = REQUIRED_ROLE_CODES.filter(code => !foundCodes.has(code));
  
  if (missingCodes.length > 0) {
    console.log(`\n⚠️  Some role codes not found: ${missingCodes.join(', ')}`);
    console.log('Checking available roles in the store...');
    
    const allRoles = await prisma.role.findMany({
      where: { storeId: STORE_ID },
      select: { code: true, displayName: true }
    });
    console.log('\nAvailable roles:');
    for (const r of allRoles.sort((a, b) => a.code.localeCompare(b.code))) {
      console.log(`  ${r.code}: "${r.displayName}"`);
    }
    
    await prisma.$disconnect();
    return;
  }

  // Get all crew for the store with their current roles
  const allCrew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    include: { CrewRole: true }
  });
  console.log(`\nFound ${allCrew.length} crew members in store ${STORE_ID}\n`);

  let totalAdded = 0;
  let totalSkipped = 0;

  for (const role of roles) {
    console.log(`\n=== Processing ${role.code} (${role.displayName}) ===`);
    let added = 0;
    let skipped = 0;

    for (const crew of allCrew) {
      // Check if they already have this role
      const hasRole = crew.CrewRole.some(cr => cr.roleId === role.id);
      
      if (hasRole) {
        skipped++;
        continue;
      }

      // Add the role
      await prisma.crewRole.create({
        data: {
          crewId: crew.id,
          roleId: role.id,
          crewName: crew.name,
          roleName: role.displayName,
        }
      });
      added++;
      console.log(`  ✅ Added ${role.code} to ${crew.name}`);
    }

    console.log(`  Summary: Added ${added}, Skipped ${skipped} (already had role)`);
    totalAdded += added;
    totalSkipped += skipped;
  }

  console.log(`\n========================================`);
  console.log(`Total: Added ${totalAdded} role assignments, Skipped ${totalSkipped}`);
  console.log(`========================================\n`);

  await prisma.$disconnect();
}

addMissingBasicRoles().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
