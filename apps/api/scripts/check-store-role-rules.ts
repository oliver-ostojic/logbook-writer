import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check StoreRoleRules 17, 20, 21, 22
  const rules = await prisma.storeRoleRule.findMany({
    where: { id: { in: [17, 20, 21, 22] } },
    include: { RoleRule: { include: { Role: true } } }
  });
  
  console.log('StoreRoleRules 17, 20, 21, 22:');
  for (const r of rules) {
    console.log(`  id=${r.id}: roleRuleId=${r.roleRuleId}, valueInt=${r.valueInt}, storeId=${r.storeId}`);
    console.log(`    RoleRule: type=${r.RoleRule.type}, roleId=${r.RoleRule.roleId} (${r.RoleRule.Role.code})`);
  }
}

main().finally(() => prisma.$disconnect());
