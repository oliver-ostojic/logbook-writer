import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // First get database counts
  console.log('\n📊 Database crew counts per role:\n');
  
  const roles = await prisma.role.findMany({
    include: {
      CrewRole: {
        select: {
          crewId: true,
        },
      },
    },
    orderBy: { displayName: 'asc' },
  });

  const dbCounts: Record<string, number> = {};
  for (const role of roles) {
    dbCounts[role.displayName || role.code] = role.CrewRole.length;
  }

  // Now fetch dashboard builder API for the available date range (Nov-Dec 2025)
  const startDate = '2025-11-01';
  const endDate = '2025-12-31';
  const storeId = 768;

  const url = `http://localhost:4000/api/stores/${storeId}/dashboard?startDate=${startDate}&endDate=${endDate}`;
  console.log(`Fetching: ${url}\n`);

  const response = await fetch(url);
  if (!response.ok) {
    console.error('Failed to fetch dashboard data:', response.statusText);
    return;
  }

  const dashboardData = await response.json();

  console.log('Dashboard structure keys:', Object.keys(dashboardData));

  // The dashboard has different structure - check both possible paths
  const logbooks = dashboardData.selection?.logbooks || dashboardData.logbooks || [];
  
  if (logbooks.length === 0) {
    console.error('No logbooks found in dashboard response');
    console.log('Full response structure:', JSON.stringify(dashboardData, null, 2).slice(0, 2000));
    return;
  }

  // Get role stats from first logbook (this is what the cards use)
  const firstLogbook = logbooks[0];

  console.log(`First logbook date: ${firstLogbook.date}\n`);
  console.log('Comparison: Database vs Dashboard roleStats\n');
  console.log('Role Name'.padEnd(20) + 'DB Count'.padEnd(12) + 'crewAssigned'.padEnd(15) + 'eligibleCrew'.padEnd(15) + 'Match?');
  console.log('-'.repeat(75));

  const roleStats = firstLogbook.roleStats || [];
  for (const roleStat of roleStats) {
    const roleName = roleStat.roleName;
    const dbCount = dbCounts[roleName] || 0;
    const crewAssigned = roleStat.crewAssignedCount || 0;
    const eligible = roleStat.eligibleCrew || 0;
    
    const matchDb = dbCount === crewAssigned ? '✅' : '❌';
    
    console.log(
      `${roleName.padEnd(20)}${String(dbCount).padEnd(12)}${String(crewAssigned).padEnd(15)}${String(eligible).padEnd(15)}${matchDb}`
    );
  }

  // Also check selection rollups
  console.log('\n\nSelection Role Rollups (selectionRoleRollups):\n');
  const selectionRollups = dashboardData.selection?.selectionRoleRollups || [];
  for (const rollup of selectionRollups) {
    console.log(`${rollup.roleName}: crewWorkedCount=${rollup.crewWorkedCount || 'N/A'}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
});
