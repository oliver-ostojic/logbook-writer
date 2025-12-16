/**
 * Fix MAX_CONSECUTIVE_MINUTES CrewRoleRules to use minutes instead of hours
 * 
 * The seeder created valueInt as 1, 2, 3, 4 (representing hours)
 * but the solver and satisfaction calculator expect minutes (60, 120, 180, 240)
 * 
 * This script converts:
 *   1 → 60
 *   2 → 120
 *   3 → 180
 *   4 → 240
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixMaxConsecutiveValues() {
  console.log('🔧 Fixing MAX_CONSECUTIVE_MINUTES CrewRoleRules...\n');

  // Find all RoleRules of type MAX_CONSECUTIVE_MINUTES
  const maxConsecRoleRules = await prisma.roleRule.findMany({
    where: { type: 'MAX_CONSECUTIVE_MINUTES' }
  });

  console.log(`Found ${maxConsecRoleRules.length} MAX_CONSECUTIVE_MINUTES RoleRules:`);
  for (const rr of maxConsecRoleRules) {
    console.log(`  - RoleRule ${rr.id}`);
  }

  const roleRuleIds = maxConsecRoleRules.map(rr => rr.id);

  // Find all CrewRoleRules that reference these RoleRules
  const crewRoleRules = await prisma.crewRoleRule.findMany({
    where: { 
      roleRuleId: { in: roleRuleIds },
      valueInt: { in: [1, 2, 3, 4] }  // Only fix ones that look like hours
    }
  });

  console.log(`\nFound ${crewRoleRules.length} CrewRoleRules with valueInt 1-4 (needs conversion)\n`);

  if (crewRoleRules.length === 0) {
    console.log('✅ No rules need fixing!');
    await prisma.$disconnect();
    return;
  }

  // Show distribution before fix
  const beforeCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const rule of crewRoleRules) {
    if (rule.valueInt && rule.valueInt >= 1 && rule.valueInt <= 4) {
      beforeCounts[rule.valueInt as 1|2|3|4]++;
    }
  }
  console.log('Before fix - valueInt distribution:');
  console.log(`  1 (should be 60min): ${beforeCounts[1]}`);
  console.log(`  2 (should be 120min): ${beforeCounts[2]}`);
  console.log(`  3 (should be 180min): ${beforeCounts[3]}`);
  console.log(`  4 (should be 240min): ${beforeCounts[4]}`);

  // Update each value: multiply by 60 to convert hours to minutes
  let updated = 0;
  
  for (const rule of crewRoleRules) {
    if (rule.valueInt && rule.valueInt >= 1 && rule.valueInt <= 4) {
      const newValue = rule.valueInt * 60;
      await prisma.crewRoleRule.update({
        where: { id: rule.id },
        data: { valueInt: newValue }
      });
      updated++;
    }
  }

  console.log(`\n✅ Updated ${updated} CrewRoleRules`);

  // Verify the fix
  const afterRules = await prisma.crewRoleRule.findMany({
    where: { roleRuleId: { in: roleRuleIds } }
  });

  const afterCounts: Record<number, number> = {};
  for (const rule of afterRules) {
    if (rule.valueInt) {
      afterCounts[rule.valueInt] = (afterCounts[rule.valueInt] || 0) + 1;
    }
  }

  console.log('\nAfter fix - valueInt distribution:');
  for (const [value, count] of Object.entries(afterCounts).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${value}min: ${count} rules`);
  }

  console.log('\n🎉 Done!');
  await prisma.$disconnect();
}

fixMaxConsecutiveValues().catch(async (e) => {
  console.error('❌ Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
