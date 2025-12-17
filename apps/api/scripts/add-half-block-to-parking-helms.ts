import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find Parking Helms role
  const parkingHelms = await prisma.role.findFirst({ where: { code: 'P_HELM' } });
  if (!parkingHelms) { 
    console.log('Parking Helms role not found'); 
    return; 
  }
  console.log('Parking Helms role:', parkingHelms.id, parkingHelms.code, parkingHelms.displayName);
  
  // Check if ALLOW_HALF_BLOCKSIZE rule already exists
  const existing = await prisma.roleRule.findFirst({
    where: { roleId: parkingHelms.id, type: 'ALLOW_HALF_BLOCKSIZE' }
  });
  
  if (existing) {
    console.log('ALLOW_HALF_BLOCKSIZE rule already exists for Parking Helms:', existing);
    return;
  }
  
  // Create the rule
  const newRule = await prisma.roleRule.create({
    data: {
      roleId: parkingHelms.id,
      type: 'ALLOW_HALF_BLOCKSIZE',
      constraintType: 'HARD',
      description: 'Allow 30-min segments for Parking Helms to support :30-aligned coverage windows'
    }
  });
  
  console.log('Created ALLOW_HALF_BLOCKSIZE rule for Parking Helms:', newRule);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
