import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find Demo role
  const demo = await prisma.role.findFirst({ where: { code: 'DEMO' } });
  if (!demo) { 
    console.log('Demo role not found'); 
    return; 
  }
  console.log('Demo role:', demo.id, demo.code, demo.displayName);
  
  // Check for ALLOW_HALF_BLOCKSIZE rule
  const rules = await prisma.roleRule.findMany({ 
    where: { roleId: demo.id },
    select: { id: true, type: true, constraintType: true }
  });
  console.log('Role rules for Demo:', rules);
  
  // Also check Parking Helms
  const parkingHelms = await prisma.role.findFirst({ where: { code: 'P_HELM' } });
  if (parkingHelms) {
    console.log('\nParking Helms role:', parkingHelms.id, parkingHelms.code, parkingHelms.displayName);
    const phRules = await prisma.roleRule.findMany({ 
      where: { roleId: parkingHelms.id },
      select: { id: true, type: true, constraintType: true }
    });
    console.log('Role rules for Parking Helms:', phRules);
  }
  
  // List all ALLOW_HALF_BLOCKSIZE rules
  const allHalfBlockRules = await prisma.roleRule.findMany({
    where: { type: 'ALLOW_HALF_BLOCKSIZE' },
    include: { Role: { select: { code: true, displayName: true } } }
  });
  console.log('\nAll ALLOW_HALF_BLOCKSIZE rules:');
  for (const rule of allHalfBlockRules) {
    console.log(`  - Role ${rule.Role.code} (${rule.Role.displayName}): rule ID ${rule.id}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
