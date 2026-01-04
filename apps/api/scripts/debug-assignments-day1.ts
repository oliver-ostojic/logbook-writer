import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Get logbook for June 1
  const logbook = await prisma.logbook.findFirst({
    where: { 
      storeId: 768,
      date: new Date('2025-06-01')
    }
  });
  
  if (!logbook) {
    console.log('No logbook found for 2025-06-01');
    await prisma.$disconnect();
    return;
  }
  
  console.log('Logbook ID:', logbook.id);
  
  // Get assignments
  const assignments = await prisma.assignment.findMany({
    where: { logbookId: logbook.id },
    include: { Role: true }
  });
  
  // Group by role
  const byRole = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const key = a.Role.displayName;
    if (!byRole.has(key)) byRole.set(key, []);
    byRole.get(key)!.push(a);
  }
  
  console.log('\n=== Assignments for 2025-06-01 ===\n');
  for (const [role, assigns] of byRole) {
    const totalMin = assigns.reduce((sum, a) => {
      const dur = (a.endTime.getTime() - a.startTime.getTime()) / 60000;
      return sum + dur;
    }, 0);
    const uniqueCrew = new Set(assigns.map(a => a.crewId)).size;
    console.log(`${role}:`);
    console.log(`  Total assignments: ${assigns.length}`);
    console.log(`  Unique crew: ${uniqueCrew}`);
    console.log(`  Total minutes: ${totalMin}`);
    console.log('');
  }
  
  // Focus on Wine Demo - show all assignments
  console.log('=== Wine Demo assignments detail ===\n');
  const wineAssigns = assignments.filter(a => a.Role.displayName === 'Wine Demo');
  wineAssigns.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  
  for (const a of wineAssigns) {
    const startHour = a.startTime.getUTCHours();
    const startMinPart = a.startTime.getUTCMinutes();
    const endHour = a.endTime.getUTCHours();
    const endMinPart = a.endTime.getUTCMinutes();
    const duration = (a.endTime.getTime() - a.startTime.getTime()) / 60000;
    console.log(`  ${a.crewId}: ${startHour}:${startMinPart.toString().padStart(2, '0')}-${endHour}:${endMinPart.toString().padStart(2, '0')} (${duration} min)`);
  }
  
  // Focus on Food Demo
  console.log('\n=== Food Demo assignments detail ===\n');
  const foodAssigns = assignments.filter(a => a.Role.displayName === 'Food Demo');
  foodAssigns.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  
  for (const a of foodAssigns) {
    const startHour = a.startTime.getUTCHours();
    const startMinPart = a.startTime.getUTCMinutes();
    const endHour = a.endTime.getUTCHours();
    const endMinPart = a.endTime.getUTCMinutes();
    const duration = (a.endTime.getTime() - a.startTime.getTime()) / 60000;
    console.log(`  ${a.crewId}: ${startHour}:${startMinPart.toString().padStart(2, '0')}-${endHour}:${endMinPart.toString().padStart(2, '0')} (${duration} min)`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
