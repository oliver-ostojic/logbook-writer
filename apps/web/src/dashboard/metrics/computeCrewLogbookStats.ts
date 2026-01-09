/**
 * Compute Crew Logbook Stats
 *
 * Calculates per-crew daily metrics for a single logbook/day.
 */

import type {
  ParsedLogbook,
  CrewLogbookStats,
} from '../types';
import { mean, median, percentage, percentageChange, rankByValue } from './statUtils';

/**
 * Compute crew statistics for a single logbook/day
 *
 * @param logbook Parsed logbook data
 * @returns Array of crew stats (one per crew)
 */
export function computeCrewLogbookStats(
  logbook: ParsedLogbook
): CrewLogbookStats[] {
  // Calculate logbook-wide average satisfaction for comparisons
  const logbookAvgSatisfactionPct = calculateLogbookAvgSatisfactionPct(logbook);

  // Calculate median minutes per assignment across all crew
  const allCrewAvgMinutesPerAssignment = logbook.crew.map(c => {
    if (c.assignments.length === 0) return 0;
    const totalMinutes = c.assignments.reduce((sum, a) => sum + a.durationMinutes, 0);
    return totalMinutes / c.assignments.length;
  });
  const medianMinutesPerAssignment = median(allCrewAvgMinutesPerAssignment);

  // Compute satisfaction rankings
  const satisfactionRanks = computeSatisfactionRanks(logbook);

  // Compute stats for each crew member
  const crewStats: CrewLogbookStats[] = logbook.crew.map(crew => {
    const assignments = crew.assignments;

    // Preference metrics (from PreferenceSatisfaction data)
    const preferencesTotal = crew.preferences.total;
    const preferencesMet = crew.preferences.met;
    const satisfactionPct = percentage(preferencesMet, preferencesTotal);

    // Satisfaction rank
    const satisfactionRank = satisfactionRanks.get(crew.crewId) || 0;

    // Comparison to crew average
    const vsCrewAvgDelta = satisfactionPct - logbookAvgSatisfactionPct;

    // Role distribution
    const avgMinutesPerAssignmentByRole = calculateAvgMinutesPerAssignmentByRole(assignments);
    const lastAssignedDateByRole = calculateLastAssignedDateByRole(assignments, logbook.date);

    // Total minutes worked
    const totalMinutesWorked = assignments.reduce((sum, a) => sum + a.durationMinutes, 0);

    // Assignment deviation from median
    const crewAvgMinutesPerAssignment = assignments.length > 0
      ? totalMinutesWorked / assignments.length
      : 0;
    const minutesPerAssignmentDeviationFromMedianPct = percentageChange(
      crewAvgMinutesPerAssignment,
      medianMinutesPerAssignment
    );

    return {
      crewId: crew.crewId,
      crewName: crew.crewName,
      preferencesTotal,
      preferencesMet,
      satisfactionPct,
      satisfactionRank,
      vsCrewAvgDelta,
      avgMinutesPerAssignmentByRole,
      totalMinutesWorked,
      lastAssignedDateByRole,
      avgMinutesPerAssignment: crewAvgMinutesPerAssignment,
      minutesPerAssignmentDeviationFromMedianPct,
      preferenceBreakdownByRuleType: crew.preferences.breakdownByRuleType || [],
    };
  });

  return crewStats;
}

/**
 * Calculate logbook-wide average satisfaction percentage
 */
function calculateLogbookAvgSatisfactionPct(logbook: ParsedLogbook): number {
  const allCrewSatisfactionPcts = logbook.crew.map(crew => {
    if (crew.preferences.total === 0) return 0;
    return percentage(crew.preferences.met, crew.preferences.total);
  });

  return mean(allCrewSatisfactionPcts);
}

/**
 * Compute satisfaction rankings for all crew
 * Rank by satisfactionPct descending, tiebreak by crewId ascending
 */
function computeSatisfactionRanks(logbook: ParsedLogbook): Map<string, number> {
  const items = logbook.crew.map(crew => {
    const satisfactionPct = crew.preferences.total > 0
      ? percentage(crew.preferences.met, crew.preferences.total)
      : 0;

    return {
      id: crew.crewId,
      value: satisfactionPct,
    };
  });

  return rankByValue(items);
}

/**
 * Calculate total minutes worked per day by role (when assigned)
 */
function calculateAvgMinutesPerAssignmentByRole(
  assignments: Array<{ roleId: string; durationMinutes: number }>
): Record<string, number> {
  const minutesByRole = new Map<string, { total: number; count: number }>();

  for (const assignment of assignments) {
    const current = minutesByRole.get(assignment.roleId) || { total: 0, count: 0 };
    minutesByRole.set(assignment.roleId, {
      total: current.total + assignment.durationMinutes,
      count: current.count + 1,
    });
  }

  const result: Record<string, number> = {};
  for (const [roleId, stats] of Array.from(minutesByRole.entries())) {
    result[roleId] = stats.total; // Total minutes on this day for this role
  }

  return result;
}

/**
 * Calculate last assigned date by role
 * For a single day, all assignments are on the same date
 */
function calculateLastAssignedDateByRole(
  assignments: Array<{ roleId: string }>,
  date: string
): Record<string, string> {
  const result: Record<string, string> = {};

  const uniqueRoles = new Set(assignments.map(a => a.roleId));
  for (const roleId of Array.from(uniqueRoles)) {
    result[roleId] = date;
  }

  return result;
}
