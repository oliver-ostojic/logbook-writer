/**
 * Seed CrewRoleRules with specific distributions for testing
 * 
 * Distributions:
 * - RoleRule 6 (MAX_CONSECUTIVE_MINUTES for REG): ALL crew
 *   intValue: 1=95%, 2=1.66%, 3=1.66%, 4=1.66%
 * 
 * - RoleRule 8 (MAX_CONSECUTIVE_MINUTES for ORDER_WRITER): ALL crew
 *   intValue: 1=23%, 2=55%, 3=14%, 4=8%
 * 
 * - RoleRule 9 (FORBID_ROLE for P_HELM): 1% of crew
 *   no intValue needed (null)
 * 
 * - RoleRule 10 (TIMING for P_HELM): ALL crew
 *   intValue: -1=88%, 0=0%, 1=12%
 * 
 * - RoleRule 11 (TIMING for STOCK): 80% of crew
 *   intValue: -1=24%, 0=28%, 1=48%
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Weighted random selection helper
function weightedRandom<T>(options: { value: T; weight: number }[]): T {
  const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const option of options) {
    random -= option.weight;
    if (random <= 0) {
      return option.value;
    }
  }
  
  return options[options.length - 1].value;
}

// Shuffle array (Fisher-Yates)
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function seedCrewRoleRules() {
  const storeId = 768;
  
  console.log('🌱 Seeding CrewRoleRules with test distributions...\n');

  // Get all crew for the store
  const allCrew = await prisma.crew.findMany({
    where: { storeId },
    select: { id: true, name: true }
  });

  console.log(`👥 Found ${allCrew.length} crew members\n`);

  // Delete existing CrewRoleRules for these role rules to start fresh
  const roleRuleIds = [6, 8, 9, 10, 11];
  const deleted = await prisma.crewRoleRule.deleteMany({
    where: { roleRuleId: { in: roleRuleIds } }
  });
  console.log(`🗑️  Deleted ${deleted.count} existing CrewRoleRules\n`);

  const rulesToCreate: { crewId: string; roleRuleId: number; valueInt: number | null }[] = [];

  // ============================================================================
  // RoleRule 6: MAX_CONSECUTIVE_MINUTES for REG - ALL crew
  // intValue: 1=95%, 2=1.66%, 3=1.66%, 4=1.66%
  // ============================================================================
  console.log('📜 RoleRule 6 (MAX_CONSECUTIVE_MINUTES REG): All crew');
  const rule6Options = [
    { value: 1, weight: 95 },
    { value: 2, weight: 1.66 },
    { value: 3, weight: 1.66 },
    { value: 4, weight: 1.66 },
  ];
  
  const rule6Counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const crew of allCrew) {
    const intValue = weightedRandom(rule6Options);
    rule6Counts[intValue as 1|2|3|4]++;
    rulesToCreate.push({ crewId: crew.id, roleRuleId: 6, valueInt: intValue });
  }
  console.log(`   Distribution: 1=${rule6Counts[1]}, 2=${rule6Counts[2]}, 3=${rule6Counts[3]}, 4=${rule6Counts[4]}`);

  // ============================================================================
  // RoleRule 8: MAX_CONSECUTIVE_MINUTES for ORDER_WRITER - ALL crew
  // intValue: 1=23%, 2=55%, 3=14%, 4=8%
  // ============================================================================
  console.log('📜 RoleRule 8 (MAX_CONSECUTIVE_MINUTES ORDER_WRITER): All crew');
  const rule8Options = [
    { value: 1, weight: 23 },
    { value: 2, weight: 55 },
    { value: 3, weight: 14 },
    { value: 4, weight: 8 },
  ];
  
  const rule8Counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const crew of allCrew) {
    const intValue = weightedRandom(rule8Options);
    rule8Counts[intValue as 1|2|3|4]++;
    rulesToCreate.push({ crewId: crew.id, roleRuleId: 8, valueInt: intValue });
  }
  console.log(`   Distribution: 1=${rule8Counts[1]}, 2=${rule8Counts[2]}, 3=${rule8Counts[3]}, 4=${rule8Counts[4]}`);

  // ============================================================================
  // RoleRule 9: FORBID_ROLE for P_HELM - 1% of crew
  // No intValue needed
  // ============================================================================
  console.log('📜 RoleRule 9 (FORBID_ROLE P_HELM): 1% of crew');
  const rule9Count = Math.max(1, Math.round(allCrew.length * 0.01));
  const rule9Crew = shuffle(allCrew).slice(0, rule9Count);
  
  for (const crew of rule9Crew) {
    rulesToCreate.push({ crewId: crew.id, roleRuleId: 9, valueInt: null });
  }
  console.log(`   Selected ${rule9Crew.length} crew: ${rule9Crew.map(c => c.name).join(', ')}`);

  // ============================================================================
  // RoleRule 10: TIMING for P_HELM - ALL crew
  // intValue: -1=88%, 0=0%, 1=12%
  // ============================================================================
  console.log('📜 RoleRule 10 (TIMING P_HELM): All crew');
  const rule10Options = [
    { value: -1, weight: 88 },
    { value: 0, weight: 0 },
    { value: 1, weight: 12 },
  ];
  
  const rule10Counts = { '-1': 0, '0': 0, '1': 0 };
  for (const crew of allCrew) {
    const intValue = weightedRandom(rule10Options);
    rule10Counts[intValue.toString() as '-1'|'0'|'1']++;
    rulesToCreate.push({ crewId: crew.id, roleRuleId: 10, valueInt: intValue });
  }
  console.log(`   Distribution: -1=${rule10Counts['-1']}, 0=${rule10Counts['0']}, 1=${rule10Counts['1']}`);

  // ============================================================================
  // RoleRule 11: TIMING for STOCK - 80% of crew
  // intValue: -1=24%, 0=28%, 1=48%
  // ============================================================================
  console.log('📜 RoleRule 11 (TIMING STOCK): 80% of crew');
  const rule11Count = Math.round(allCrew.length * 0.80);
  const rule11Crew = shuffle(allCrew).slice(0, rule11Count);
  
  const rule11Options = [
    { value: -1, weight: 24 },
    { value: 0, weight: 28 },
    { value: 1, weight: 48 },
  ];
  
  const rule11Counts = { '-1': 0, '0': 0, '1': 0 };
  for (const crew of rule11Crew) {
    const intValue = weightedRandom(rule11Options);
    rule11Counts[intValue.toString() as '-1'|'0'|'1']++;
    rulesToCreate.push({ crewId: crew.id, roleRuleId: 11, valueInt: intValue });
  }
  console.log(`   Selected ${rule11Crew.length} crew`);
  console.log(`   Distribution: -1=${rule11Counts['-1']}, 0=${rule11Counts['0']}, 1=${rule11Counts['1']}`);

  // ============================================================================
  // Create all rules in bulk
  // ============================================================================
  console.log(`\n💾 Creating ${rulesToCreate.length} CrewRoleRules...`);
  
  await prisma.crewRoleRule.createMany({
    data: rulesToCreate.map(r => ({
      crewId: r.crewId,
      roleRuleId: r.roleRuleId,
      valueInt: r.valueInt,
      isPriority: false,
    }))
  });

  // Verify counts
  const finalCounts = await prisma.crewRoleRule.groupBy({
    by: ['roleRuleId'],
    where: { roleRuleId: { in: roleRuleIds } },
    _count: true,
  });

  console.log('\n✅ Created CrewRoleRules:');
  for (const count of finalCounts) {
    console.log(`   RoleRule ${count.roleRuleId}: ${count._count} rules`);
  }

  console.log('\n🎉 Seeding complete!');
  await prisma.$disconnect();
}

seedCrewRoleRules().catch(async (e) => {
  console.error('❌ Seeding failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
