/**
 * Compute Role Selection Rollups
 *
 * Aggregates role metrics across multiple selected dates.
 */

import type {
  LogbookStats,
  RoleSelectionStats,
  RoleByDateAverage,
  ParsedLogbook,
  RoleInput,
} from '../types';
import type { RoleRuleInput } from '../buildDashboardSnapshot';
import { mean, percentage } from './statUtils';
import { buildLorenzCurve } from './lorenzCurve';
import { buildBucketDistribution } from './bucketDistribution';

/**
 * Compute role rollup statistics across selected dates
 *
 * @param logbooks Array of logbook stats from selected dates
 * @param parsedLogbooks Array of parsed logbooks (for detailed assignment data)
 * @param allRoles All roles from the store
 * @param roleRules Optional role rules (for FORBID_ROLE filtering)
 * @returns Array of role selection stats
 */
export function computeRoleSelectionRollups(
  logbooks: LogbookStats[],
  parsedLogbooks: ParsedLogbook[],
  allRoles: RoleInput[],
  roleRules: RoleRuleInput[] = []
): RoleSelectionStats[] {
  // Build a map of forbidden crew per role (crew with FORBID_ROLE rules)
  const forbiddenCrewByRole = new Map<string, Set<string>>();
  roleRules
    .filter(r => r.type === 'FORBID_ROLE')
    .forEach(r => {
      if (!forbiddenCrewByRole.has(r.roleId)) {
        forbiddenCrewByRole.set(r.roleId, new Set());
      }
      forbiddenCrewByRole.get(r.roleId)!.add(r.crewId);
    });

  // Get all unique role IDs
  const allRoleIds = new Set<string>();
  allRoles.forEach(r => allRoleIds.add(r.roleId));

  // Build rollups for each role
  const roleRollups: RoleSelectionStats[] = [];

  for (const roleId of Array.from(allRoleIds)) {
    const role = allRoles.find(r => r.roleId === roleId);
    if (!role) continue;

    // Aggregate work distribution across selection
    const { minutesWorkedOnRoleTotal, totalMinutesWorkedSelection } =
      computeWorkDistribution(roleId, parsedLogbooks);

    const minutesOnRoleVsTotalWorkPct = percentage(
      minutesWorkedOnRoleTotal,
      totalMinutesWorkedSelection
    );

    // Compute unique crew who worked on this role across the selection
    const minutesWorkedByCrew = computeMinutesWorkedByCrewOnRole(
      roleId,
      parsedLogbooks
    );
    
    // Get forbidden crew for this role
    const forbiddenCrew = forbiddenCrewByRole.get(roleId) || new Set<string>();
    
    // Count crew who have > 0 minutes AND are not forbidden
    const crewWorkedOnRoleCount = Array.from(minutesWorkedByCrew.entries())
      .filter(([crewId, minutes]) => minutes > 0 && !forbiddenCrew.has(crewId))
      .length;

    // Fairness metrics - collect from roleStats (which now includes calculated gini for ALL roles)
    let avgFairnessIndexPct: number | null = null;
    let avgGiniCoefficient: number | null = null;

    const giniCoefficients: number[] = [];

    // Collect gini coefficients from roleStats (computed per-day from assignments)
    logbooks.forEach(lb => {
      const roleStats = lb.roleStats.find(rs => rs.roleId === roleId);
      if (roleStats && roleStats.giniCoefficient !== null && roleStats.giniCoefficient !== undefined) {
        giniCoefficients.push(roleStats.giniCoefficient);
      }
    });

    // Calculate averages
    if (giniCoefficients.length > 0) {
      avgGiniCoefficient = mean(giniCoefficients);
      // Convert gini to fairness index: (1 - gini) * 100
      avgFairnessIndexPct = (1 - avgGiniCoefficient) * 100;
    }

    // Lorenz curve data - use minutes PER DAY WORKED to match fairness calculation
    // This normalizes for crew who work different numbers of days
    const minutesPerDayByCrew = computeMinutesPerDayWorkedByCrewOnRole(
      roleId,
      parsedLogbooks
    );
    const lorenzCurveData = buildLorenzCurve(minutesPerDayByCrew);

    // Bucket distribution - also use normalized data for consistency
    const bucketDistribution = buildBucketDistribution(minutesPerDayByCrew);

    // Time series: by-date averages
    const byDateAverages: RoleByDateAverage[] = logbooks.map(lb => {
      const roleStats = lb.roleStats.find(rs => rs.roleId === roleId);
      const avgMinutesPerCrewOnRole = roleStats?.avgMinutesPerAssignment || 0;

      return {
        date: lb.logbook.date,
        avgMinutesPerCrewOnRole,
      };
    });

    roleRollups.push({
      roleId,
      roleName: role.roleName,
      isEnforced: role.isEnforced,
      crewWorkedOnRoleCount,
      minutesWorkedOnRoleTotal,
      totalMinutesWorkedSelection,
      minutesOnRoleVsTotalWorkPct,
      avgFairnessIndexPct,
      avgGiniCoefficient,
      lorenzCurveData,
      bucketDistribution,
      byDateAverages,
    });
  }

  return roleRollups;
}

/**
 * Compute total work distribution
 */
function computeWorkDistribution(
  roleId: string,
  parsedLogbooks: ParsedLogbook[]
): {
  minutesWorkedOnRoleTotal: number;
  totalMinutesWorkedSelection: number;
} {
  let minutesWorkedOnRoleTotal = 0;
  let totalMinutesWorkedSelection = 0;

  parsedLogbooks.forEach(lb => {
    lb.crew.forEach(crew => {
      crew.assignments.forEach(assignment => {
        totalMinutesWorkedSelection += assignment.durationMinutes;

        if (assignment.roleId === roleId) {
          minutesWorkedOnRoleTotal += assignment.durationMinutes;
        }
      });
    });
  });

  return {
    minutesWorkedOnRoleTotal,
    totalMinutesWorkedSelection,
  };
}

/**
 * Compute minutes worked by each crew member on a specific role
 * Returns raw total minutes (not normalized)
 */
function computeMinutesWorkedByCrewOnRole(
  roleId: string,
  parsedLogbooks: ParsedLogbook[]
): Map<string, number> {
  const minutesByCrew = new Map<string, number>();

  parsedLogbooks.forEach(lb => {
    lb.crew.forEach(crew => {
      const roleAssignments = crew.assignments.filter(a => a.roleId === roleId);
      const totalMinutes = roleAssignments.reduce(
        (sum, a) => sum + a.durationMinutes,
        0
      );

      minutesByCrew.set(
        crew.crewId,
        (minutesByCrew.get(crew.crewId) || 0) + totalMinutes
      );
    });
  });

  return minutesByCrew;
}

/**
 * Compute minutes per day worked by each crew member on a specific role.
 * This normalizes by days worked to match how the fairness index is calculated.
 * 
 * Only includes crew who actually worked on at least one day (excludes crew with 0 days).
 */
function computeMinutesPerDayWorkedByCrewOnRole(
  roleId: string,
  parsedLogbooks: ParsedLogbook[]
): Map<string, number> {
  const totalMinutesByCrew = new Map<string, number>();
  const daysWorkedByCrew = new Map<string, number>();

  parsedLogbooks.forEach(lb => {
    // Track which crew worked on this date (had any shift, not just this role)
    const crewWorkedToday = new Set<string>();
    
    lb.crew.forEach(crew => {
      // If crew has any assignments on this day, they worked today
      if (crew.assignments.length > 0) {
        crewWorkedToday.add(crew.crewId);
      }
      
      // Sum minutes for the specific role
      const roleAssignments = crew.assignments.filter(a => a.roleId === roleId);
      const totalMinutes = roleAssignments.reduce(
        (sum, a) => sum + a.durationMinutes,
        0
      );

      totalMinutesByCrew.set(
        crew.crewId,
        (totalMinutesByCrew.get(crew.crewId) || 0) + totalMinutes
      );
    });
    
    // Increment days worked for each crew who worked today
    crewWorkedToday.forEach(crewId => {
      daysWorkedByCrew.set(crewId, (daysWorkedByCrew.get(crewId) || 0) + 1);
    });
  });

  // Calculate minutes per day worked
  const minutesPerDayByCrew = new Map<string, number>();
  
  totalMinutesByCrew.forEach((totalMinutes, crewId) => {
    const daysWorked = daysWorkedByCrew.get(crewId) || 0;
    
    // Only include crew who worked at least one day
    if (daysWorked > 0) {
      minutesPerDayByCrew.set(crewId, totalMinutes / daysWorked);
    }
  });

  return minutesPerDayByCrew;
}
