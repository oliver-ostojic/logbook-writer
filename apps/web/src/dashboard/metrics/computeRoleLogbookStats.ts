/**
 * Compute Role Logbook Stats
 *
 * Calculates per-role daily metrics for a single logbook/day.
 * Uses RoleFairnessSnapshot data for proper lookback-based fairness metrics.
 */

import type { ParsedLogbook, RoleLogbookStats } from '../types';
import { mean, median, min, max, percentage } from './statUtils';
import { calculateGini } from './lorenzCurve';

/**
 * Compute role statistics for a single logbook/day
 *
 * @param logbook Parsed logbook data
 * @returns Array of role stats (one per role)
 */
export function computeRoleLogbookStats(
  logbook: ParsedLogbook
): RoleLogbookStats[] {
  // Get all unique roles from logbook metadata
  const roleIds = new Set(logbook.roles.map(r => r.roleId));

  // Calculate total crew count
  const crewTotalCount = logbook.crew.length;

  // Calculate average total minutes worked per crew (across all roles)
  const totalMinutesPerCrew = logbook.crew.map(crew =>
    crew.assignments.reduce((sum, a) => sum + a.durationMinutes, 0)
  );
  const avgTotalMinutesWorkedPerCrew = mean(totalMinutesPerCrew);

  // Compute stats for each role
  const roleStats: RoleLogbookStats[] = [];

  for (const roleId of Array.from(roleIds)) {
    const role = logbook.roles.find(r => r.roleId === roleId);
    if (!role) continue;

    // Get all assignments for this role
    const roleAssignments = logbook.crew.flatMap(crew =>
      crew.assignments
        .filter(a => a.roleId === roleId)
        .map(a => ({ crewId: crew.crewId, ...a }))
    );

    // Basic metrics (from assignments)
    // Calculate average total minutes per crew (when assigned to this role)
    const minutesByCrewMember = new Map<string, number>();
    roleAssignments.forEach(a => {
      minutesByCrewMember.set(
        a.crewId,
        (minutesByCrewMember.get(a.crewId) || 0) + a.durationMinutes
      );
    });
    const crewTotals = Array.from(minutesByCrewMember.values());
    const avgMinutesPerAssignment = crewTotals.length > 0 ? mean(crewTotals) : 0;

    const totalMinutesWorked = roleAssignments.reduce(
      (sum, a) => sum + a.durationMinutes,
      0
    );

    const crewAssignedCount = new Set(roleAssignments.map(a => a.crewId)).size;

    // Fairness metrics
    const snapshot = logbook.roleFairnessSnapshots.get(roleId);

    let eligibleCrew: number | null = null;
    let fairnessScore: number | null = null;
    let fairnessStatus: 'excellent' | 'good' | 'ok' | 'bad' | null = null;
    let fairnessGrade: string | null = null;
    let giniCoefficient: number | null = null;
    let minMinutesPerDay: number | null = null;
    let maxMinutesPerDay: number | null = null;
    let avgMinutesPerDay: number | null = null;

    if (snapshot) {
      // Get eligible crew count (crew with CrewRole for this role)
      eligibleCrew = snapshot.eligibleCrew;
    }

    // Calculate gini coefficient for ALL roles (not just enforced)
    // Build minutes distribution map from current day's assignments
    const minutesDistribution = new Map<string, number>();
    logbook.crew.forEach(crew => {
      const crewRoleMinutes = crew.assignments
        .filter(a => a.roleId === roleId)
        .reduce((sum, a) => sum + a.durationMinutes, 0);
      minutesDistribution.set(crew.crewId, crewRoleMinutes);
    });

    // Calculate gini from distribution (only if crew worked this role)
    if (minutesDistribution.size > 0) {
      const valuesWithWork = Array.from(minutesDistribution.values()).filter(m => m > 0);
      if (valuesWithWork.length > 0) {
        giniCoefficient = calculateGini(minutesDistribution);
      }
    }

    // For enforced roles, prefer snapshot data for fairness metrics that use lookback
    if (role.isEnforced && snapshot) {
      // Use snapshot data (includes lookback window) for historical fairness metrics
      fairnessScore = snapshot.stdDeviation;
      fairnessGrade = snapshot.fairnessGrade;
      minMinutesPerDay = snapshot.minMinutesPerDay;
      maxMinutesPerDay = snapshot.maxMinutesPerDay;
      avgMinutesPerDay = snapshot.avgMinutesPerDay;

      // Prefer snapshot gini if available (uses lookback window)
      if (snapshot.giniCoefficient !== null && snapshot.giniCoefficient !== undefined) {
        giniCoefficient = snapshot.giniCoefficient;
      }

      // Map fairness grade to status
      fairnessStatus = gradeToStatus(snapshot.fairnessGrade);
    }

    // Distribution metrics (from current day assignments)
    const minutesPerCrewOnRole = logbook.crew.map(crew => {
      const crewRoleAssignments = crew.assignments.filter(a => a.roleId === roleId);
      return crewRoleAssignments.reduce((sum, a) => sum + a.durationMinutes, 0);
    });

    // For spread calculation, only consider crew who actually worked this role (minutes > 0)
    const minutesForCrewWhoWorkedRole = minutesPerCrewOnRole.filter(m => m > 0);

    const minMinutesCurrent = min(minutesForCrewWhoWorkedRole);
    const maxMinutesCurrent = max(minutesForCrewWhoWorkedRole);
    const medianMinutes = median(minutesForCrewWhoWorkedRole);

    const spreadFromMedianPct = medianMinutes > 0 && minutesForCrewWhoWorkedRole.length > 1
      ? percentage(maxMinutesCurrent - minMinutesCurrent, medianMinutes)
      : 0;

    // Time share calculation
    const avgMinutesOnRole = mean(minutesPerCrewOnRole);
    const timeSharePctAvg = avgTotalMinutesWorkedPerCrew > 0
      ? percentage(avgMinutesOnRole, avgTotalMinutesWorkedPerCrew)
      : 0;

    roleStats.push({
      roleId,
      roleName: role.roleName,
      isEnforced: role.isEnforced,
      avgMinutesPerAssignment,
      totalMinutesWorked,
      crewAssignedCount,
      crewTotalCount,
      eligibleCrew,
      fairnessScore,
      fairnessStatus,
      fairnessGrade,
      giniCoefficient,
      minMinutesPerDay,
      maxMinutesPerDay,
      avgMinutesPerDay,
      spreadFromMedianPct,
      timeSharePctAvg,
    });
  }

  return roleStats;
}

/**
 * Convert fairness grade to status
 */
function gradeToStatus(grade: string): 'excellent' | 'good' | 'ok' | 'bad' {
  if (grade === 'A+' || grade === 'A' || grade === 'A-') return 'excellent';
  if (grade === 'B+' || grade === 'B' || grade === 'B-') return 'good';
  if (grade === 'C+' || grade === 'C' || grade === 'C-') return 'ok';
  return 'bad';
}
