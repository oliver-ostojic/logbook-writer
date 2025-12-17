import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fix() {
  // Find the wrong entry (Gary Medina with roleRuleId 23 and valueInt 480)
  const wrongEntry = await prisma.crewRoleRule.findFirst({
    where: {
      Crew: { name: 'Gary Medina' },
      roleRuleId: 23,
      valueInt: 480
    }
  });
  
  if (wrongEntry) {
    await prisma.crewRoleRule.delete({ where: { id: wrongEntry.id } });
    console.log('Deleted wrong entry for Gary Medina');
  } else {
    console.log('No entry found for Gary Medina with roleRuleId 23');
  }
  
  // Find Di Cannon
  const diCannon = await prisma.crew.findFirst({
    where: { name: { contains: 'Di Cannon' } }
  });
  
  if (!diCannon) {
    console.log('Di Cannon not found');
    await prisma.$disconnect();
    return;
  }
  
  console.log('Found Di Cannon:', diCannon.id, diCannon.name);
  
  // Add DISLIKE REG at hour 7 (420 min) for Di Cannon
  const existing = await prisma.crewRoleRule.findFirst({
    where: { crewId: diCannon.id, roleRuleId: 23, valueInt: 420 }
  });
  
  if (existing) {
    console.log('Di Cannon already has DISLIKE REG at hour 7');
  } else {
    await prisma.crewRoleRule.create({
      data: {
        crewId: diCannon.id,
        roleRuleId: 23,
        valueInt: 420
      }
    });
    console.log('Added DISLIKE REG at hour 7 (420 min) to Di Cannon');
  }
  
  await prisma.$disconnect();
}

fix().catch(console.error);
