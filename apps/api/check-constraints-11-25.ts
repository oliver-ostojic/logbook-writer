import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get Register role for store 768
  const registerRole = await prisma.role.findFirst({
    where: { storeId: 768, code: 'register' }
  });
  console.log('Register role ID:', registerRole?.id);
  
  // Get hourly constraints for Register on 11/25
  const constraints = await prisma.hourlyRoleConstraint.findMany({
    where: {
      roleId: registerRole?.id,
      date: new Date('2025-11-25')
    },
    orderBy: { hour: 'asc' }
  });
  
  console.log('\nHourly constraints for Register on 11/25:');
  for (const c of constraints) {
    console.log(`  Hour ${c.hour}: min=${c.minCrew}, max=${c.maxCrew}`);
  }
  
  // Get shifts on 11/25 to see available crew at hour 8
  const shifts = await prisma.shift.findMany({
    where: {
      storeId: 768,
      date: new Date('2025-11-25')
    },
    include: { crew: true }
  });
  
  // Count crew available at each hour (UTC) - shifts use startMin/endMin
  const crewAtHour: Record<number, string[]> = {};
  for (const s of shifts) {
    const startHour = Math.floor(s.startMin / 60);
    const endHour = Math.floor(s.endMin / 60);
    for (let h = startHour; h < endHour; h++) {
      if (!crewAtHour[h]) crewAtHour[h] = [];
      crewAtHour[h].push(s.crew.name);
    }
  }
  
  console.log('\nCrew available at each hour:');
  const hours = Object.keys(crewAtHour).map(Number).sort((a,b) => a-b);
  for (const h of hours) {
    console.log(`  Hour ${h}: ${crewAtHour[h].length} crew`);
  }
  
  console.log('\nCrew at hour 8 specifically:', crewAtHour[8]?.length || 0);
  if (crewAtHour[8]) {
    console.log('  Names:', crewAtHour[8].join(', '));
  }
  
  // Check who can actually do Register via roleAccess on role
  const roleWithAccess = await prisma.role.findFirst({
    where: { storeId: 768, code: 'register' },
    include: { roleAccess: { include: { crew: true } } }
  });
  
  console.log('\nCrew with Register role access:', roleWithAccess?.roleAccess.length);
  
  // Cross-reference: crew at hour 8 who CAN do register
  const registerCrewIds = new Set(roleWithAccess?.roleAccess.map(r => r.crewId) ?? []);
  const shiftsAtHour8 = shifts.filter(s => {
    const startHour = Math.floor(s.startMin / 60);
    const endHour = Math.floor(s.endMin / 60);
    return startHour <= 8 && endHour > 8;
  });
  
  const canDoRegisterAtHour8 = shiftsAtHour8.filter(s => registerCrewIds.has(s.crewId));
  console.log('\nCrew at hour 8 who CAN do Register:', canDoRegisterAtHour8.length);
  console.log('  Names:', canDoRegisterAtHour8.map(s => s.crew.name).join(', '));
}

main().catch(console.error).finally(() => prisma.$disconnect());
