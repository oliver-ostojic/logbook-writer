import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STORE_ID = 768;
const ROLE_RULE_ID = 1;

// The crew who were missing basic roles (from previous script run)
const CREW_NAMES = [
  'Melissa Ochoa',
  'Leo Kelly',
  'Chase Watts',
  'Leonardo Saenz-Marmol',
  'Andrea Canizares',
  'Revilo Cijotso',
  'Patricia Edgar',
  'Adrian Pena',
  'Cianna Sala',
  'Q Mowatt',
  'Ben Stogis',
  'Jill Sachs',
  'Nikki Lera',
  'Aaron Haverstock',
  'Kit Riffel',
  'Morgan Bussius',
  'Rodney Colon',
];

async function addRoleRuleToMissingCrew() {
  console.log(`Adding roleRuleId ${ROLE_RULE_ID} to crew who were missing basic roles...\n`);

  // First, check what roleRule 1 is
  const roleRule = await prisma.roleRule.findUnique({
    where: { id: ROLE_RULE_ID },
    include: { Role: true }
  });

  if (!roleRule) {
    console.error(`RoleRule ${ROLE_RULE_ID} not found`);
    await prisma.$disconnect();
    return;
  }

  console.log(`RoleRule ${ROLE_RULE_ID}: type="${roleRule.type}", role="${roleRule.Role?.displayName ?? roleRule.Role?.code}"`);

  // Get all crew for the store
  const allCrew = await prisma.crew.findMany({
    where: { storeId: STORE_ID },
    include: { CrewRoleRule: true }
  });

  let added = 0;
  let skipped = 0;
  let notFound = 0;

  for (const name of CREW_NAMES) {
    // Find crew by exact name match
    const crew = allCrew.find(c => c.name === name);

    if (!crew) {
      console.log(`❌ Crew "${name}" not found`);
      notFound++;
      continue;
    }

    // Check if they already have this roleRule
    const hasRoleRule = crew.CrewRoleRule.some(crr => crr.roleRuleId === ROLE_RULE_ID);
    
    if (hasRoleRule) {
      console.log(`⏭️  ${crew.name} already has roleRuleId ${ROLE_RULE_ID}`);
      skipped++;
      continue;
    }

    // Add the roleRule
    await prisma.crewRoleRule.create({
      data: {
        crewId: crew.id,
        roleRuleId: ROLE_RULE_ID,
      }
    });
    console.log(`✅ Added roleRuleId ${ROLE_RULE_ID} to ${crew.name}`);
    added++;
  }

  console.log(`\n========================================`);
  console.log(`Added: ${added}, Skipped: ${skipped}, Not Found: ${notFound}`);
  console.log(`========================================\n`);

  await prisma.$disconnect();
}

addRoleRuleToMissingCrew().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
