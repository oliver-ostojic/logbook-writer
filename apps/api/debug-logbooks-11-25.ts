import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get logbooks for store 768 on 2025-11-25
  const logbooks = await prisma.logbook.findMany({
    where: {
      storeId: 768,
      date: new Date('2025-11-25')
    },
    include: {
      assignments: {
        include: {
          role: true,
          crew: true
        }
      }
    }
  });
  
  console.log('Found', logbooks.length, 'logbooks for 11/25');
  
  for (const lb of logbooks) {
    console.log('\n=== Logbook:', lb.id, '===');
    console.log('Status:', (lb as any).status || (lb as any).published);
    console.log('Total assignments:', lb.assignments.length);
    
    // Group by role and hour
    const byRoleHour: Record<string, Record<number, string[]>> = {};
    
    for (const a of lb.assignments) {
      const roleName = a.role.displayName || a.role.code;
      if (!byRoleHour[roleName]) byRoleHour[roleName] = {};
      
      const startHour = a.startTime.getUTCHours();
      const endHour = a.endTime.getUTCHours();
      
      for (let h = startHour; h < endHour; h++) {
        if (!byRoleHour[roleName][h]) byRoleHour[roleName][h] = [];
        byRoleHour[roleName][h].push(a.crew.name);
      }
    }
    
    // Show Register breakdown by hour
    if (byRoleHour['Register']) {
      console.log('\nRegister by hour:');
      const hours = Object.keys(byRoleHour['Register']).map(Number).sort((a,b) => a-b);
      for (const h of hours) {
        console.log(`  Hour ${h}: ${byRoleHour['Register'][h].length} people - ${byRoleHour['Register'][h].join(', ')}`);
      }
    }
    
    // Show Break assignments
    if (byRoleHour['Break']) {
      console.log('\nBreak by hour:');
      const hours = Object.keys(byRoleHour['Break']).map(Number).sort((a,b) => a-b);
      for (const h of hours) {
        console.log(`  Hour ${h}: ${byRoleHour['Break'][h].length} people - ${byRoleHour['Break'][h].join(', ')}`);
      }
    }
    
    // Show all roles summary
    console.log('\nAll roles summary:');
    for (const [role, hours] of Object.entries(byRoleHour)) {
      const hourKeys = Object.keys(hours).map(Number).sort((a,b) => a-b);
      const counts = hourKeys.map(h => `${h}:${hours[h].length}`).join(', ');
      console.log(`  ${role}: ${counts}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
