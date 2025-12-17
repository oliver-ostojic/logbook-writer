/**
 * Quick check of what valueInt values we have stored
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get LIKE/DISLIKE hour preference rules
  const hourRuleIds = [22, 23, 24, 26, 28]; // LIKE_REG, DISLIKE_REG, LIKE_PROD, LIKE_ART, LIKE_SL
  
  const rules = await prisma.crewRoleRule.findMany({
    where: { roleRuleId: { in: hourRuleIds } },
    include: { Crew: true, RoleRule: true },
    orderBy: { valueInt: 'asc' }
  });
  
  console.log(`Found ${rules.length} hour preference rules\n`);
  
  // Group by valueInt
  const byValueInt = new Map<number, number>();
  for (const r of rules) {
    const val = r.valueInt ?? 0;
    byValueInt.set(val, (byValueInt.get(val) || 0) + 1);
  }
  
  console.log('valueInt distribution:');
  for (const [val, count] of [...byValueInt.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${val}: ${count} rules`);
  }
  
  console.log('\nSample rules:');
  for (const r of rules.slice(0, 15)) {
    console.log(`  ${r.Crew.name.padEnd(20)} roleRuleId=${r.roleRuleId} valueInt=${r.valueInt} (${r.RoleRule.type})`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
