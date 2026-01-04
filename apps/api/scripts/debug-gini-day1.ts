import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const date = new Date('2025-06-01');
  
  // Check snapshots for June 1
  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: { 
      storeId: 768,
      date
    },
    include: { Role: true }
  });
  
  console.log('=== Snapshots for 2025-06-01 ===\n');
  for (const s of snapshots) {
    console.log(`Role: ${s.Role.displayName} (ID: ${s.roleId})`);
    console.log(`  Gini Coefficient: ${s.giniCoefficient.toFixed(4)}`);
    console.log(`  Eligible Crew: ${s.eligibleCrew}`);
    console.log(`  Crew With Minutes: ${s.crewWithMinutes}`);
    console.log(`  Lookback Days: ${s.lookbackDays}`);
    console.log(`  Min/Avg/Max MPH: ${s.minMinutesPerDay.toFixed(2)} / ${s.avgMinutesPerDay.toFixed(2)} / ${s.maxMinutesPerDay.toFixed(2)}`);
    console.log('');
  }
  
  // Check fairness history for June 1
  const history = await prisma.crewRoleFairnessHistory.findMany({
    where: { 
      storeId: 768,
      date
    },
    include: { Role: true }
  });
  
  console.log('=== Fairness History for 2025-06-01 ===\n');
  console.log(`Total records: ${history.length}`);
  
  // Group by role
  const byRole = new Map<number, { roleName: string; records: typeof history }>();
  for (const h of history) {
    if (!byRole.has(h.roleId)) {
      byRole.set(h.roleId, { roleName: h.Role.displayName, records: [] });
    }
    byRole.get(h.roleId)!.records.push(h);
  }
  
  for (const [roleId, data] of byRole) {
    console.log(`\nRole: ${data.roleName} (ID: ${roleId})`);
    console.log(`  Crew assigned: ${data.records.length}`);
    console.log(`  Minutes distribution:`);
    for (const r of data.records) {
      console.log(`    ${r.crewId}: ${r.minutesAssigned} min`);
    }
  }
  
  // Now let's check eligible crew for each role
  console.log('\n=== Eligible Crew per Role ===\n');
  const roleIds = [29, 37, 38]; // Parking Helms, Wine Demo, Food Demo
  
  for (const roleId of roleIds) {
    const eligible = await prisma.crewRole.findMany({
      where: { roleId },
      include: { Role: true }
    });
    const role = eligible[0]?.Role.displayName || `Role ${roleId}`;
    console.log(`${role}: ${eligible.length} eligible crew`);
    
    // How many of them got assigned on Day 1?
    const assigned = history.filter(h => h.roleId === roleId);
    console.log(`  Assigned on Day 1: ${assigned.length}`);
    console.log(`  Not assigned: ${eligible.length - assigned.length}`);
    
    // Calculate what Gini SHOULD be
    const eligibleCrewIds = new Set(eligible.map(e => e.crewId));
    const minutesByCrewId = new Map<string, number>();
    
    // Initialize all eligible with 0
    for (const e of eligible) {
      minutesByCrewId.set(e.crewId, 0);
    }
    
    // Add actual minutes
    for (const h of assigned) {
      minutesByCrewId.set(h.crewId, h.minutesAssigned);
    }
    
    const values = Array.from(minutesByCrewId.values());
    const gini = calculateGini(values);
    console.log(`  Calculated Gini (raw minutes): ${gini.toFixed(4)}`);
    console.log('');
  }
  
  await prisma.$disconnect();
}

function calculateGini(values: number[]): number {
  if (values.length === 0) return 0;
  
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  
  if (total === 0) return 0;
  
  let sumOfDifferences = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumOfDifferences += Math.abs(sorted[i] - sorted[j]);
    }
  }
  
  return sumOfDifferences / (2 * n * total);
}

main().catch(console.error);
