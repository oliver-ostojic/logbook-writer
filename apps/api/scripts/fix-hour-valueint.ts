/**
 * Fix valueInt for hour preferences:
 * - 60 → 0 (first hour of shift, not second)
 * - 480 → 420 (hour 8 of shift = minute 420)
 * - 420 → 360 (hour 7 of shift = minute 360)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fixing hour preference valueInt values...\n');
  
  // Get the role rule IDs for LIKE/DISLIKE hour preferences
  const hourRuleIds = [22, 23, 24, 26, 28]; // LIKE_REG, DISLIKE_REG, LIKE_PROD, LIKE_ART, LIKE_SL
  
  // Fix valueInt=60 → 0 (first hour)
  const firstHourFix = await prisma.crewRoleRule.updateMany({
    where: {
      roleRuleId: { in: hourRuleIds },
      valueInt: 60
    },
    data: {
      valueInt: 0
    }
  });
  console.log(`Fixed ${firstHourFix.count} rules: valueInt 60 → 0 (first hour)`);
  
  // Fix valueInt=480 → 420 (hour 8 = minute 420)
  const hour8Fix = await prisma.crewRoleRule.updateMany({
    where: {
      roleRuleId: { in: hourRuleIds },
      valueInt: 480
    },
    data: {
      valueInt: 420
    }
  });
  console.log(`Fixed ${hour8Fix.count} rules: valueInt 480 → 420 (hour 8)`);
  
  // Fix valueInt=420 → 360 (hour 7 = minute 360)
  const hour7Fix = await prisma.crewRoleRule.updateMany({
    where: {
      roleRuleId: { in: hourRuleIds },
      valueInt: 420
    },
    data: {
      valueInt: 360
    }
  });
  console.log(`Fixed ${hour7Fix.count} rules: valueInt 420 → 360 (hour 7)`);
  
  // Verify the changes
  console.log('\nVerifying changes...');
  const rules = await prisma.crewRoleRule.findMany({
    where: { roleRuleId: { in: hourRuleIds } },
    include: { Crew: true, RoleRule: true },
    orderBy: { valueInt: 'asc' }
  });
  
  const byValueInt = new Map<number, number>();
  for (const r of rules) {
    const val = r.valueInt ?? 0;
    byValueInt.set(val, (byValueInt.get(val) || 0) + 1);
  }
  
  console.log('\nNew valueInt distribution:');
  for (const [val, count] of [...byValueInt.entries()].sort((a, b) => a[0] - b[0])) {
    const hourNum = val / 60 + 1;
    console.log(`  ${val} (hour ${hourNum} of shift): ${count} rules`);
  }
  
  // Show specific rules for verification
  console.log('\nSample rules after fix:');
  for (const r of rules.slice(0, 10)) {
    const hourNum = (r.valueInt ?? 0) / 60 + 1;
    console.log(`  ${r.Crew.name.padEnd(20)} valueInt=${r.valueInt} (hour ${hourNum}) - ${r.RoleRule.type}`);
  }
  
  // Show hour 7 and 8 rules specifically
  const specialRules = rules.filter(r => r.valueInt === 360 || r.valueInt === 420);
  if (specialRules.length > 0) {
    console.log('\nHour 7 and Hour 8 rules:');
    for (const r of specialRules) {
      const hourNum = (r.valueInt ?? 0) / 60 + 1;
      console.log(`  ${r.Crew.name.padEnd(20)} valueInt=${r.valueInt} (hour ${hourNum}) - ${r.RoleRule.type}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
