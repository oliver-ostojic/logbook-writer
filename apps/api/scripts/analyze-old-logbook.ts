/**
 * Analyze an old logbook to understand what worked vs current solver input
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const LOGBOOK_ID = '497482ac-1c00-484a-bd9f-9b885719f735';

async function main() {
  console.log('=== ANALYZING OLD LOGBOOK ===\n');
  
  // 1. Get the old logbook
  const logbook = await prisma.logbook.findUnique({
    where: { id: LOGBOOK_ID },
    include: {
      Assignment: true,
      Run: true,
    }
  }) as any;
  
  if (!logbook) {
    console.log('Logbook not found:', LOGBOOK_ID);
    return;
  }
  
  console.log('LOGBOOK INFO:');
  console.log('  ID:', logbook.id);
  console.log('  Date:', logbook.date);
  console.log('  Store:', logbook.storeId);
  console.log('  Created:', logbook.createdAt);
  
  const assignments = logbook.Assignment || [];
  const runs = logbook.Run || [];
  
  console.log('  Assignments:', assignments.length);
  console.log('  Runs:', runs.length);
  
  // Get unique crew from assignments
  const crewIds = [...new Set(assignments.map((a: any) => a.crewId))];
  console.log('  Unique crew in assignments:', crewIds.length);
  
  // Get unique roles
  const roleIds = [...new Set(assignments.map((a: any) => a.roleId))];
  console.log('  Unique roles:', roleIds);
  
  // 2. Get current solver input for same date
  console.log('\n=== FETCHING CURRENT SOLVER INPUT ===\n');
  
  const response = await fetch(`http://localhost:4000/solver/input?storeId=${logbook.storeId}&date=${logbook.date}`);
  if (!response.ok) {
    console.log('Failed to fetch solver input:', response.status);
    return;
  }
  
  const solverInput = await response.json();
  
  console.log('CURRENT SOLVER INPUT:');
  console.log('  Crew count:', solverInput.crew?.length || 0);
  console.log('  Coverage windows:', solverInput.coverageWindows?.length || 0);
  console.log('  Crew quotas:', solverInput.crewQuotas?.length || 0);
  console.log('  Role rules:', solverInput.roleRules?.length || 0);
  
  // 3. Compare crew
  console.log('\n=== CREW COMPARISON ===\n');
  
  const currentCrewIds = new Set(solverInput.crew?.map((c: any) => c.id) || []);
  const oldCrewIds = new Set(crewIds);
  
  const missingFromCurrent = crewIds.filter(id => !currentCrewIds.has(id));
  const newInCurrent = [...currentCrewIds].filter(id => !oldCrewIds.has(id));
  
  console.log('Crew in old logbook but NOT in current input:', missingFromCurrent.length);
  if (missingFromCurrent.length > 0 && missingFromCurrent.length <= 10) {
    console.log('  Missing crew IDs:', missingFromCurrent);
  }
  
  console.log('Crew in current input but NOT in old logbook:', newInCurrent.length);
  
  // 4. Check coverage windows
  console.log('\n=== COVERAGE WINDOWS ===\n');
  for (const cw of (solverInput.coverageWindows || [])) {
    console.log(`  ${cw.roleCode || cw.roleId}: ${cw.crewCount} crew from ${cw.startMin} to ${cw.endMin} (task: ${cw.taskLength}min)`);
  }
  
  // 5. Check crew quotas
  console.log('\n=== CREW QUOTAS ===\n');
  console.log('Total quotas:', solverInput.crewQuotas?.length || 0);
  
  // Group by role
  const quotasByRole: Record<string, number> = {};
  for (const q of (solverInput.crewQuotas || [])) {
    const roleCode = q.roleCode || q.roleId;
    quotasByRole[roleCode] = (quotasByRole[roleCode] || 0) + 1;
  }
  console.log('Quotas by role:', quotasByRole);
  
  // 6. Validate old assignments against current constraints
  console.log('\n=== VALIDATING OLD ASSIGNMENTS ===\n');
  
  // Check if old assignments would satisfy coverage windows
  for (const cw of (solverInput.coverageWindows || [])) {
    // Count assignments in this window
    const assignmentsInWindow = assignments.filter((a: any) => 
      a.roleId === cw.roleId &&
      a.startMinute >= cw.startMin &&
      a.startMinute < cw.endMin
    );
    
    // Group by slot (30 min)
    const slotMinutes = 30;
    const slots: Record<number, number> = {};
    for (let min = cw.startMin; min < cw.endMin; min += slotMinutes) {
      slots[min] = 0;
    }
    
    for (const a of assignmentsInWindow) {
      const slot = Math.floor(a.startMinute / slotMinutes) * slotMinutes;
      if (slots[slot] !== undefined) {
        slots[slot]++;
      }
    }
    
    // Check for violations
    const violations = Object.entries(slots)
      .filter(([_, count]) => count < cw.crewCount)
      .map(([slot, count]) => `slot ${slot}: ${count}/${cw.crewCount}`);
    
    if (violations.length > 0) {
      console.log(`⚠️  ${cw.roleCode || cw.roleId} coverage violations:`, violations.slice(0, 5).join(', '));
    } else {
      console.log(`✓  ${cw.roleCode || cw.roleId} coverage OK`);
    }
  }
  
  // 7. Check quota satisfaction
  console.log('\n=== QUOTA SATISFACTION ===\n');
  let quotasSatisfied = 0;
  let quotasViolated = 0;
  
  for (const q of (solverInput.crewQuotas || [])) {
    // Sum up minutes for this crew/role
    const crewAssignments = assignments.filter((a: any) => 
      a.crewId === q.crewId && 
      a.roleId === q.roleId &&
      a.startMinute >= q.windowStart &&
      a.endMinute <= q.windowEnd
    );
    
    const totalMinutes = crewAssignments.reduce((sum: number, a: any) => sum + (a.endMinute - a.startMinute), 0);
    
    if (totalMinutes >= q.minMinutes) {
      quotasSatisfied++;
    } else {
      quotasViolated++;
      if (quotasViolated <= 10) {
        console.log(`⚠️  Quota violation: ${q.crewName || q.crewId} needs ${q.minMinutes}min of ${q.roleCode || q.roleId}, got ${totalMinutes}min`);
      }
    }
  }
  
  console.log(`\nQuota summary: ${quotasSatisfied} satisfied, ${quotasViolated} violated`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
