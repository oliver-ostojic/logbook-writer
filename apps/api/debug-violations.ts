import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debug() {
  const logbook = await prisma.logbook.findFirst({
    where: { storeId: 768, date: new Date('2025-11-25') },
    orderBy: { createdAt: 'desc' }
  });

  if (!logbook) {
    console.log('No logbook found');
    return;
  }

  // Check a few crew members who show as violations
  const crewToCheck = ['Stephanie Mitchell', 'Alice De Simoni', 'Kaylyn Pipitone', 'Adam Levi', 'Oliver Ostojic'];
  
  for (const name of crewToCheck) {
    const crew = await prisma.crew.findFirst({ where: { name } });
    if (!crew) continue;
    
    const assignments = await prisma.assignment.findMany({
      where: { logbookId: logbook.id, crewId: crew.id },
      include: { Role: { select: { code: true, id: true } } },
      orderBy: { startTime: 'asc' }
    });
    
    console.log(`\n${name} (${crew.id}):`);
    
    let hasReg = false;
    let hasHelm = false;
    let regStart = Infinity;
    let helmEnd = 0;
    
    for (const a of assignments) {
      const start = a.startTime.getUTCHours() * 60 + a.startTime.getUTCMinutes();
      const end = a.endTime.getUTCHours() * 60 + a.endTime.getUTCMinutes();
      const startStr = `${Math.floor(start/60)}:${(start%60).toString().padStart(2, '0')}`;
      const endStr = `${Math.floor(end/60)}:${(end%60).toString().padStart(2, '0')}`;
      
      const marker = a.Role.code === 'REG' ? ' ← REG' : (a.Role.code === 'P_HELM' ? ' ← P_HELM' : '');
      console.log(`  ${startStr} - ${endStr} : ${a.Role.code}${marker}`);
      
      if (a.Role.code === 'REG') {
        hasReg = true;
        regStart = Math.min(regStart, start);
      }
      if (a.Role.code === 'P_HELM') {
        hasHelm = true;
        helmEnd = Math.max(helmEnd, end);
      }
    }
    
    if (hasReg && hasHelm) {
      console.log(`  → REG starts at ${regStart}, P_HELM ends at ${helmEnd}`);
      if (regStart >= helmEnd) {
        console.log(`  → VIOLATION: REG (${regStart}) starts at or after P_HELM ends (${helmEnd})`);
      } else {
        console.log(`  → OK: REG (${regStart}) starts before P_HELM ends (${helmEnd})`);
      }
    } else {
      console.log(`  → hasReg=${hasReg}, hasHelm=${hasHelm}`);
    }
  }
  
  await prisma.$disconnect();
}

debug().catch(console.error);
