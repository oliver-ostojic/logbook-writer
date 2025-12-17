import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const rules = await prisma.crewRoleRule.findMany({
    where: { Crew: { name: { contains: 'Di Cannon' } } },
    include: { RoleRule: { include: { Role: true } } }
  });
  
  console.log('Di Cannon role rules:');
  for (const r of rules) {
    console.log(`  - RoleRule ${r.roleRuleId}: ${r.RoleRule.type} (${r.RoleRule.Role?.code}), valueInt=${r.valueInt}`);
  }
  
  await prisma.$disconnect();
}

check().catch(console.error);
