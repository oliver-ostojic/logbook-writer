/**
 * Compute Crew Selection Rollups
 *
 * Aggregates crew metrics across multiple selected dates.
 */

import type {
  LogbookStats,
  CrewSelectionStats,
  SatisfactionByDate,
  ParsedLogbook,
  CrewRuleBreakdown,
  CrewLogbookStats,
} from '../types';
import { mean, percentage, rankByValue } from './statUtils';

/**
 * Compute crew rollup statistics across selected dates
 *
 * @param logbooks Array of logbook stats from selected dates
 * @param parsedLogbooks Array of parsed logbooks (for detailed assignment data)
 * @returns Array of crew selection stats
 */
export function computeCrewSelectionRollups(
  logbooks: LogbookStats[],
  parsedLogbooks: ParsedLogbook[]
): CrewSelectionStats[] {
  // Get all unique crew IDs across all logbooks
  const allCrewIds = new Set<string>();
  logbooks.forEach(lb => {
    lb.crewStats.forEach(cs => allCrewIds.add(cs.crewId));
  });

  // Build rollups for each crew
  const crewRollups: CrewSelectionStats[] = [];

  for (const crewId of Array.from(allCrewIds)) {
    // Get crew stats from each logbook
    const dailyStats = logbooks
      .map(lb => lb.crewStats.find(cs => cs.crewId === crewId))
      .filter((cs): cs is NonNullable<typeof cs> => cs !== undefined);

    if (dailyStats.length === 0) continue;

    const crewName = dailyStats[0].crewName;

    // Aggregated preference metrics
    const preferencesTotalSelection = dailyStats.reduce(
      (sum, ds) => sum + ds.preferencesTotal,
      0
    );
    const preferencesMetSelection = dailyStats.reduce(
      (sum, ds) => sum + ds.preferencesMet,
      0
    );
    const avgSatisfactionPctOverSelection = mean(
      dailyStats.map(ds => ds.satisfactionPct)
    );

    // Comparison metrics
    const avgVsCrewAvgDeltaOverSelection = mean(
      dailyStats.map(ds => ds.vsCrewAvgDelta)
    );

    // Satisfaction time series (one point per day)
    const satisfactionByDate: SatisfactionByDate[] = [];
    logbooks.forEach(lb => {
      const crewStat = lb.crewStats.find(cs => cs.crewId === crewId);
      if (!crewStat) return;

      satisfactionByDate.push({
        date: lb.logbook.date,
        satisfactionPct: crewStat.satisfactionPct,
        avgSatisfactionPct: crewStat.avgSatisfactionPct,
      });
    });

    // Role metrics across selection
    const avgMinutesPerAssignmentByRoleSelection = computeAvgMinutesPerAssignmentByRole(
      dailyStats
    );

    const avgTimeSharePctByRoleSelection = computeAvgTimeSharePctByRole(
      crewId,
      parsedLogbooks
    );

    const lastAssignedDateByRoleSelection = computeLastAssignedDateByRole(
      dailyStats
    );

    // Aggregate preference breakdown by rule type across selection
    const preferenceBreakdownByRuleType = computePreferenceBreakdownByRuleType(dailyStats);

    // Overall rank computed later after all crew are processed
    crewRollups.push({
      crewId,
      crewName,
      avgSatisfactionPctOverSelection,
      preferencesTotalSelection,
      preferencesMetSelection,
      avgVsCrewAvgDeltaOverSelection,
      overallRankInSelection: 0, // Computed in next step
      satisfactionByDate,
      avgMinutesPerAssignmentByRoleSelection,
      avgTimeSharePctByRoleSelection,
      lastAssignedDateByRoleSelection,
      preferenceBreakdownByRuleType,
    });
  }

  // Compute overall ranks
  const ranks = rankByValue(
    crewRollups.map(cr => ({
      id: cr.crewId,
      value: cr.avgSatisfactionPctOverSelection,
    }))
  );

  crewRollups.forEach(cr => {
    cr.overallRankInSelection = ranks.get(cr.crewId) || 0;
  });

  return crewRollups;
}

/**
 * Compute average total minutes assigned per day by role across selection
 * Takes average of daily totals (only counting days when crew was assigned to role)
 */
function computeAvgMinutesPerAssignmentByRole(
  dailyStats: Array<{ avgMinutesPerAssignmentByRole: Record<string, number> }>
): Record<string, number> {
  const roleMinutesSum = new Map<string, number>();
  const roleDayCounts = new Map<string, number>();

  dailyStats.forEach(ds => {
    Object.entries(ds.avgMinutesPerAssignmentByRole).forEach(([roleId, dailyTotal]) => {
      roleMinutesSum.set(roleId, (roleMinutesSum.get(roleId) || 0) + dailyTotal);
      roleDayCounts.set(roleId, (roleDayCounts.get(roleId) || 0) + 1);
    });
  });

  const result: Record<string, number> = {};
  for (const [roleId, totalMinutes] of Array.from(roleMinutesSum.entries())) {
    const count = roleDayCounts.get(roleId) || 1;
    result[roleId] = totalMinutes / count;
  }

  return result;
}

/**
 * Compute average time share percentage by role
 * (totalMinutesOnRole / totalMinutesWorked) * 100
 */
function computeAvgTimeSharePctByRole(
  crewId: string,
  parsedLogbooks: ParsedLogbook[]
): Record<string, number> {
  const roleMinutes = new Map<string, number>();
  let totalMinutesWorked = 0;

  // Aggregate minutes per role across all logbooks
  parsedLogbooks.forEach(lb => {
    const crew = lb.crew.find(c => c.crewId === crewId);
    if (!crew) return;

    crew.assignments.forEach(assignment => {
      roleMinutes.set(
        assignment.roleId,
        (roleMinutes.get(assignment.roleId) || 0) + assignment.durationMinutes
      );
      totalMinutesWorked += assignment.durationMinutes;
    });
  });

  // Calculate percentage for each role
  const result: Record<string, number> = {};
  for (const [roleId, minutes] of Array.from(roleMinutes.entries())) {
    result[roleId] = percentage(minutes, totalMinutesWorked);
  }

  return result;
}

/**
 * Compute last assigned date by role within selection
 */
function computeLastAssignedDateByRole(
  dailyStats: Array<{
    lastAssignedDateByRole: Record<string, string>;
  }>
): Record<string, string> {
  const roleDates = new Map<string, string[]>();

  dailyStats.forEach(ds => {
    Object.entries(ds.lastAssignedDateByRole).forEach(([roleId, date]) => {
      const dates = roleDates.get(roleId) || [];
      dates.push(date);
      roleDates.set(roleId, dates);
    });
  });

  const result: Record<string, string> = {};
  for (const [roleId, dates] of Array.from(roleDates.entries())) {
    // Get most recent date
    const sorted = dates.sort((a, b) => b.localeCompare(a)); // Descending
    result[roleId] = sorted[0];
  }

  return result;
}

/**
 * Aggregate preference breakdown by rule type across selection
 * Sums total and met for each rule type across all days
 */
function computePreferenceBreakdownByRuleType(
  dailyStats: CrewLogbookStats[]
): CrewRuleBreakdown[] {
  const byRuleType = new Map<string, { total: number; met: number }>();

  dailyStats.forEach(ds => {
    (ds.preferenceBreakdownByRuleType || []).forEach(breakdown => {
      const existing = byRuleType.get(breakdown.ruleType) || { total: 0, met: 0 };
      existing.total += breakdown.total;
      existing.met += breakdown.met;
      byRuleType.set(breakdown.ruleType, existing);
    });
  });

  const result: CrewRuleBreakdown[] = [];
  byRuleType.forEach((stats, ruleType) => {
    result.push({
      ruleType,
      total: stats.total,
      met: stats.met,
      percentMet: stats.total > 0 ? (stats.met / stats.total) * 100 : 0,
    });
  });

  return result;
}
