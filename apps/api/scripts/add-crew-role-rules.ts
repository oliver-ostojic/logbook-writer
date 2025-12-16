import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ROLE_RULE_ID = 1;
  const PERCENTAGE = 1.0; // 100% of crew

  // First, check what RoleRule 1 is
  const roleRule = await prisma.roleRule.findUnique({
    where: { id: ROLE_RULE_ID },
    include: { Role: true },
  });

  if (!roleRule) {
    console.error(`RoleRule ${ROLE_RULE_ID} not found!`);
    return;
  }

  console.log(`RoleRule ${ROLE_RULE_ID}:`, {
    type: roleRule.type,
    roleId: roleRule.roleId,
    roleCode: roleRule.Role.code,
    constraintType: roleRule.constraintType,
    description: roleRule.description,
  });

  // Get all crew
  const allCrew = await prisma.crew.findMany({
    select: { id: true, name: true },
  });

  console.log(`\nTotal crew in database: ${allCrew.length}`);

  // Calculate how many to add (90%)
  const targetCount = Math.floor(allCrew.length * PERCENTAGE);
  console.log(`Will add CrewRoleRules for ${targetCount} crew (${PERCENTAGE * 100}%)`);

  // Randomly select 90% of crew
  const shuffled = allCrew.sort(() => Math.random() - 0.5);
  const selectedCrew = shuffled.slice(0, targetCount);

  // Check existing CrewRoleRules for this roleRuleId
  const existing = await prisma.crewRoleRule.findMany({
    where: { roleRuleId: ROLE_RULE_ID },
    select: { crewId: true },
  });
  const existingCrewIds = new Set(existing.map((e) => e.crewId));
  console.log(`Existing CrewRoleRules for roleRuleId ${ROLE_RULE_ID}: ${existingCrewIds.size}`);

  // Filter out crew who already have this rule
  const crewToAdd = selectedCrew.filter((c) => !existingCrewIds.has(c.id));
  console.log(`Crew to add (excluding existing): ${crewToAdd.length}`);

  if (crewToAdd.length === 0) {
    console.log('No new CrewRoleRules to add.');
    return;
  }

  // Add CrewRoleRules
  const result = await prisma.crewRoleRule.createMany({
    data: crewToAdd.map((crew) => ({
      crewId: crew.id,
      roleRuleId: ROLE_RULE_ID,
      valueInt: null, // Default value, adjust if needed
      isPriority: false,
    })),
    skipDuplicates: true,
  });

  console.log(`\n✅ Created ${result.count} CrewRoleRules for roleRuleId ${ROLE_RULE_ID}`);

  // Verify
  const totalNow = await prisma.crewRoleRule.count({
    where: { roleRuleId: ROLE_RULE_ID },
  });
  console.log(`Total CrewRoleRules for roleRuleId ${ROLE_RULE_ID} now: ${totalNow}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
