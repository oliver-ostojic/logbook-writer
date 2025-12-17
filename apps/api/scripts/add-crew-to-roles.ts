import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;

// Crew to add to SL role
const SL_CREW_NAMES = [
  'Stephanie M',
  'Adam Carey',
  'Kit',
  'Morgan',
  'Patricia',
  'Andre',
  'Ben',
  'Jill',
];

// Crew to add to ART role
const ART_CREW_NAMES = [
  'Abby Stapleton',
];

async function addCrewToRoles() {
  console.log('Adding crew members to roles...\n');

  // Find the SL and ART roles
  const slRole = await prisma.role.findFirst({
    where: { code: 'SL', storeId: STORE_ID }
  });
  
  const artRole = await prisma.role.findFirst({
    where: { code: 'ART', storeId: STORE_ID }
  });

  if (!slRole) {
    console.error('SL role not found for store', STORE_ID);
    return;
  }
  console.log(`Found SL role: id=${slRole.id}, name="${slRole.displayName}"`);

  if (!artRole) {
    console.error('ART role not found for store', STORE_ID);
    return;
  }
  console.log(`Found ART role: id=${artRole.id}, name="${artRole.displayName}"`);

  // Get all crew for the store
  const allCrew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    include: { CrewRole: true }
  });
  console.log(`\nFound ${allCrew.length} crew members in store ${STORE_ID}\n`);

  // Add SL role to specified crew
  console.log('=== Adding SL role ===');
  for (const name of SL_CREW_NAMES) {
    // Find crew by partial name match (case insensitive)
    const crew = allCrew.find(c => 
      c.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(c.name.toLowerCase())
    );

    if (!crew) {
      console.log(`❌ Crew "${name}" not found`);
      continue;
    }

    // Check if they already have this role
    const hasRole = crew.CrewRole.some(cr => cr.roleId === slRole.id);
    if (hasRole) {
      console.log(`⏭️  ${crew.name} (${crew.id}) already has SL role`);
      continue;
    }

    // Add the role
    await prisma.crewRole.create({
      data: {
        crewId: crew.id,
        roleId: slRole.id,
        crewName: crew.name,
        roleName: slRole.displayName,
      }
    });
    console.log(`✅ Added SL role to ${crew.name} (${crew.id})`);
  }

  // Add ART role to specified crew
  console.log('\n=== Adding ART role ===');
  for (const name of ART_CREW_NAMES) {
    // Find crew by partial name match (case insensitive)
    const crew = allCrew.find(c => 
      c.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(c.name.toLowerCase())
    );

    if (!crew) {
      console.log(`❌ Crew "${name}" not found`);
      continue;
    }

    // Check if they already have this role
    const hasRole = crew.CrewRole.some(cr => cr.roleId === artRole.id);
    if (hasRole) {
      console.log(`⏭️  ${crew.name} (${crew.id}) already has ART role`);
      continue;
    }

    // Add the role
    await prisma.crewRole.create({
      data: {
        crewId: crew.id,
        roleId: artRole.id,
        crewName: crew.name,
        roleName: artRole.displayName,
      }
    });
    console.log(`✅ Added ART role to ${crew.name} (${crew.id})`);
  }

  console.log('\n✅ Done!');
}

addCrewToRoles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
