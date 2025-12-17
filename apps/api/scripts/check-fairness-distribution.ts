/**
 * Check fairness and distribution across saved logbooks
 * Shows per-crew satisfaction and cross-day fairness trends
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const storeId = 768;
  
  console.log('='.repeat(80));
  console.log('FAIRNESS & DISTRIBUTION ANALYSIS');
  console.log('='.repeat(80));
  
  // Get all logbooks for this store with their preference metadata
  const logbooks = await prisma.logbook.findMany({
    where: { storeId },
    include: {
      LogPreferenceMetadata: true,
      Assignment: {
        include: {
          Crew: true,
          Role: true,
        }
      }
    },
    orderBy: { date: 'asc' }
  });
  
  console.log(`\nFound ${logbooks.length} logbooks for store ${storeId}\n`);
  
  if (logbooks.length === 0) {
    console.log('No logbooks found!');
    return;
  }
  
  // Summary table header
  console.log('LOGBOOK SUMMARY');
  console.log('-'.repeat(80));
  console.log(
    'Date'.padEnd(12) +
    'Status'.padEnd(12) +
    'Prefs Met'.padEnd(12) +
    'Avg Sat'.padEnd(10) +
    'Fairness'.padEnd(10) +
    'Grade'.padEnd(8) +
    'Crew'.padEnd(6)
  );
  console.log('-'.repeat(80));
  
  for (const logbook of logbooks) {
    const meta = logbook.LogPreferenceMetadata;
    const date = logbook.date.toISOString().split('T')[0];
    
    if (meta) {
      console.log(
        date.padEnd(12) +
        logbook.status.padEnd(12) +
        `${meta.percentMet.toFixed(1)}%`.padEnd(12) +
        `${meta.avgSatisfaction.toFixed(1)}%`.padEnd(10) +
        `${meta.fairnessIndex.toFixed(1)}%`.padEnd(10) +
        meta.fairnessGrade.padEnd(8) +
        `${meta.eligibleCrew}`.padEnd(6)
      );
    } else {
      console.log(
        date.padEnd(12) +
        logbook.status.padEnd(12) +
        'No metadata'.padEnd(40)
      );
    }
  }
  
  // Analyze per-crew distribution across all logbooks
  console.log('\n' + '='.repeat(80));
  console.log('PER-CREW ROLE DISTRIBUTION (across all logbooks)');
  console.log('='.repeat(80));
  
  // Aggregate assignments by crew and role
  const crewRoleMinutes: Record<string, Record<string, number>> = {};
  const crewNames: Record<string, string> = {};
  const roleNames: Record<number, string> = {};
  
  for (const logbook of logbooks) {
    for (const assignment of logbook.Assignment) {
      const crewId = assignment.crewId;
      const roleId = assignment.roleId;
      const startMinutes = assignment.startTime.getHours() * 60 + assignment.startTime.getMinutes();
      const endMinutes = assignment.endTime.getHours() * 60 + assignment.endTime.getMinutes();
      const minutes = endMinutes - startMinutes;
      
      crewNames[crewId] = assignment.Crew?.name || 'Unknown';
      roleNames[roleId] = assignment.Role?.displayName || `Role ${roleId}`;
      
      if (!crewRoleMinutes[crewId]) {
        crewRoleMinutes[crewId] = {};
      }
      crewRoleMinutes[crewId][roleId] = (crewRoleMinutes[crewId][roleId] || 0) + minutes;
    }
  }
  
  // Get unique roles across all assignments
  const allRoles = [...new Set(Object.values(crewRoleMinutes).flatMap(r => Object.keys(r).map(Number)))];
  allRoles.sort((a, b) => a - b);
  
  // Print header
  const roleHeader = allRoles.map(r => roleNames[r].substring(0, 8).padEnd(9)).join('');
  console.log('\n' + 'Crew'.padEnd(20) + 'Total'.padEnd(10) + roleHeader);
  console.log('-'.repeat(20 + 10 + allRoles.length * 9));
  
  // Print per-crew breakdown
  const crewIds = Object.keys(crewRoleMinutes);
  crewIds.sort((a, b) => crewNames[a].localeCompare(crewNames[b]));
  
  for (const crewId of crewIds) {
    const roles = crewRoleMinutes[crewId];
    const totalMinutes = Object.values(roles).reduce((sum, m) => sum + m, 0);
    
    let row = crewNames[crewId].substring(0, 18).padEnd(20);
    row += `${totalMinutes}m`.padEnd(10);
    
    for (const roleId of allRoles) {
      const minutes = roles[roleId] || 0;
      if (minutes > 0) {
        row += `${minutes}m`.padEnd(9);
      } else {
        row += '-'.padEnd(9);
      }
    }
    
    console.log(row);
  }
  
  // Role totals
  console.log('-'.repeat(20 + 10 + allRoles.length * 9));
  let totalRow = 'TOTAL'.padEnd(20);
  let grandTotal = 0;
  for (const roleId of allRoles) {
    const roleTotal = crewIds.reduce((sum, crewId) => sum + (crewRoleMinutes[crewId][roleId] || 0), 0);
    grandTotal += roleTotal;
  }
  totalRow += `${grandTotal}m`.padEnd(10);
  for (const roleId of allRoles) {
    const roleTotal = crewIds.reduce((sum, crewId) => sum + (crewRoleMinutes[crewId][roleId] || 0), 0);
    totalRow += `${roleTotal}m`.padEnd(9);
  }
  console.log(totalRow);
  
  // Show RoleRule breakdown from metadata
  console.log('\n' + '='.repeat(80));
  console.log('ROLERULE SATISFACTION BREAKDOWN (from latest logbook)');
  console.log('='.repeat(80));
  
  const latestLogbook = logbooks[logbooks.length - 1];
  const latestMeta = latestLogbook.LogPreferenceMetadata;
  
  if (latestMeta && latestMeta.breakdownByRoleRule) {
    const breakdown = latestMeta.breakdownByRoleRule as any[];
    
    if (breakdown.length > 0) {
      console.log('\n' + 
        'RoleRule'.padEnd(35) + 
        'Eligible'.padEnd(10) + 
        'Met'.padEnd(8) + 
        '% Met'.padEnd(10) + 
        'Avg Sat'.padEnd(10)
      );
      console.log('-'.repeat(73));
      
      for (const rule of breakdown) {
        console.log(
          (rule.ruleType || `Rule ${rule.roleRuleId}`).substring(0, 33).padEnd(35) +
          `${rule.eligible}`.padEnd(10) +
          `${rule.met}`.padEnd(8) +
          `${rule.percentMet?.toFixed(1) || 0}%`.padEnd(10) +
          `${rule.avgSatisfaction?.toFixed(1) || 0}%`.padEnd(10)
        );
      }
    } else {
      console.log('No breakdown data available');
    }
  } else {
    console.log('No metadata available for latest logbook');
  }
  
  // Cross-day fairness trend
  if (logbooks.length >= 2) {
    console.log('\n' + '='.repeat(80));
    console.log('CROSS-DAY FAIRNESS TREND');
    console.log('='.repeat(80));
    
    const fairnessValues = logbooks
      .filter(l => l.LogPreferenceMetadata)
      .map(l => ({
        date: l.date.toISOString().split('T')[0],
        fairness: l.LogPreferenceMetadata!.fairnessIndex,
        grade: l.LogPreferenceMetadata!.fairnessGrade,
      }));
    
    console.log('\nDate         Fairness  Grade  Trend');
    console.log('-'.repeat(40));
    
    for (let i = 0; i < fairnessValues.length; i++) {
      const curr = fairnessValues[i];
      let trend = '';
      if (i > 0) {
        const prev = fairnessValues[i - 1];
        const diff = curr.fairness - prev.fairness;
        if (diff > 1) trend = `↑ +${diff.toFixed(1)}`;
        else if (diff < -1) trend = `↓ ${diff.toFixed(1)}`;
        else trend = '→ stable';
      }
      console.log(`${curr.date}   ${curr.fairness.toFixed(1)}%     ${curr.grade.padEnd(4)}   ${trend}`);
    }
    
    // Average fairness
    const avgFairness = fairnessValues.reduce((sum, v) => sum + v.fairness, 0) / fairnessValues.length;
    console.log('-'.repeat(40));
    console.log(`AVERAGE:     ${avgFairness.toFixed(1)}%`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('WHAT WE HAVE IMPLEMENTED:');
  console.log('='.repeat(80));
  console.log(`
1. LogPreferenceMetadata Table:
   - Stores per-logbook satisfaction metrics
   - Tracks: eligiblePreferences, preferencesMet, percentMet, avgSatisfaction
   - Tracks: eligibleCrew, avgSatisfactionPerCrew
   - Tracks: fairnessIndex (Gini-based), fairnessGrade (A+ to F)
   - Stores breakdownByRoleRule (JSON array with per-rule stats)

2. Fairness Index Calculation:
   - Uses Gini coefficient on per-crew satisfaction scores
   - Converted to 0-100 scale (100 = perfect equality)
   - Graded: A+ (>=94), A (>=88), A- (>=82), B+ (>=76), B (>=70), etc.

3. Per-Crew Satisfaction:
   - Each crew member's satisfaction = avg of their eligible rule scores
   - Rules evaluated: TIMING, FIRST_HOUR, FAVORITE, LIKE_ROLE_FOR_HOUR_X, etc.

4. RoleRule Types Being Tracked:
   - TIMING (early/late shift preferences)
   - FIRST_HOUR (preferred role at start of shift)
   - FAVORITE (preferred role overall)
   - LIKE_ROLE_FOR_HOUR_X (specific hour preferences)
   - DISLIKE_ROLE_FOR_HOUR_X (roles to avoid at specific hours)
   - DISTRIBUTION_BETWEEN_ROLE_X (balance between two roles)

5. Solver Objective Weights (current):
   - ASSIGNMENT_REWARD: 100 (fill slots)
   - HALF_SIZE_PENALTY: 70 (prefer full blocks)
   - HOUR_PREFERENCE_WEIGHT: 50 (LIKE/DISLIKE hour)
   - DISTRIBUTION_WEIGHT: 30 (spread work)
   - HOUR_ALIGNED_BONUS: 15 (start at :00)
   - CONSECUTIVE_BONUS: 10 (same role back-to-back)
   - TIMING_BONUS_WEIGHT: 5 (early/late prefs)
`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
