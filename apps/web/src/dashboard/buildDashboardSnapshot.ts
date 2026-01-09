/**
 * Build Dashboard Snapshot
 *
 * Main builder function that transforms logbook input data into a complete
 * dashboard snapshot JSON payload.
 */

import type {
  DashboardSnapshot,
  LogbookInput,
  ParsedLogbook,
  ParsedCrew,
  ParsedAssignment,
  LogbookStats,
} from './types';
import { computeCrewLogbookStats } from './metrics/computeCrewLogbookStats';
import { computeRoleLogbookStats } from './metrics/computeRoleLogbookStats';
import { computeCrewSelectionRollups } from './metrics/computeCrewSelectionRollups';
import { computeRoleSelectionRollups } from './metrics/computeRoleSelectionRollups';
import { mean } from './metrics/statUtils';

export interface RoleRuleInput {
  crewId: string;
  roleId: string;
  type: string;
}

export interface BuildDashboardSnapshotParams {
  storeId: string;
  timezone: string;
  selectionId: string;
  selectionLabel: string;
  selectedDates: string[]; // All requested dates
  logbooks: LogbookInput[]; // Only logbooks with data
  roleRules?: RoleRuleInput[]; // Optional role rules (for FORBID_ROLE filtering)
}

/**
 * Build complete dashboard snapshot from logbook input data
 *
 * @param params Build parameters
 * @returns Complete dashboard snapshot
 */
export function buildDashboardSnapshot(
  params: BuildDashboardSnapshotParams
): DashboardSnapshot {
  const {
    storeId,
    timezone,
    selectionId,
    selectionLabel,
    selectedDates,
    logbooks,
    roleRules = [],
  } = params;

  // Parse logbooks: convert datetime strings to minutes
  const parsedLogbooks = logbooks.map(parseLogbook);

  // Identify missing dates
  const logbookDates = new Set(logbooks.map(lb => lb.date));
  const missingDates = selectedDates.filter(date => !logbookDates.has(date));

  // Compute per-logbook stats
  const logbookStats: LogbookStats[] = parsedLogbooks.map(lb => ({
    logbook: {
      logbookId: lb.logbookId,
      date: lb.date,
    },
    dayAggregate: {
      satisfactionPct: lb.aggregateStats.percentMet,
      totalPreferences: lb.aggregateStats.eligiblePreferences,
      preferencesMet: lb.aggregateStats.preferencesMet,
      breakdownByRuleType: lb.aggregateStats.breakdownByRoleRule,
    },
    crewStats: computeCrewLogbookStats(lb),
    roleStats: computeRoleLogbookStats(lb),
  }));

  // Compute selection rollups
  const selectionCrewRollups = computeCrewSelectionRollups(
    logbookStats,
    parsedLogbooks
  );

  // Get all unique roles across all logbooks
  const allRoles = Array.from(
    new Map(
      parsedLogbooks.flatMap(lb => lb.roles.map(r => [r.roleId, r]))
    ).values()
  );

  const selectionRoleRollups = computeRoleSelectionRollups(
    logbookStats,
    parsedLogbooks,
    allRoles,
    roleRules
  );

  // Compute selection-level aggregates
  const selectionAggregates = computeSelectionAggregates(
    logbookStats,
    parsedLogbooks
  );

  // Build final snapshot
  const snapshot: DashboardSnapshot = {
    meta: {
      version: 1,
      storeId,
      timezone,
      generatedAt: new Date().toISOString(),
    },
    selection: {
      selectionId,
      label: selectionLabel,
      selectedDates,
      missingDates,
      logbooks: logbookStats,
      selectionAggregates,
      selectionCrewRollups,
      selectionRoleRollups,
    },
  };

  return snapshot;
}

/**
 * Parse logbook input: convert datetime strings to minutes
 */
function parseLogbook(logbook: LogbookInput): ParsedLogbook {
  const parsedCrew: ParsedCrew[] = logbook.crew.map(crew => ({
    crewId: crew.crewId,
    crewName: crew.crewName,
    assignments: crew.assignments.map(assignment => parseAssignment(assignment)),
    preferences: crew.preferences,
  }));

  // Convert roleFairnessSnapshots array to Map for faster lookup
  const snapshotMap = new Map(
    logbook.roleFairnessSnapshots.map(snap => [snap.roleId, snap])
  );

  return {
    logbookId: logbook.logbookId,
    date: logbook.date,
    storeId: logbook.storeId,
    crew: parsedCrew,
    roles: logbook.roles,
    aggregateStats: logbook.aggregateStats,
    roleFairnessSnapshots: snapshotMap,
  };
}

/**
 * Parse assignment: convert ISO datetime strings to minutes from midnight
 */
function parseAssignment(assignment: {
  assignmentId: string;
  roleId: string;
  roleName: string;
  startTime: string;
  endTime: string;
}): ParsedAssignment {
  const startDate = new Date(assignment.startTime);
  const endDate = new Date(assignment.endTime);

  const startMinute = startDate.getUTCHours() * 60 + startDate.getUTCMinutes();
  const endMinute = endDate.getUTCHours() * 60 + endDate.getUTCMinutes();
  const durationMinutes = endMinute - startMinute;

  return {
    assignmentId: assignment.assignmentId,
    roleId: assignment.roleId,
    roleName: assignment.roleName,
    startMinute,
    endMinute,
    durationMinutes,
  };
}

/**
 * Compute selection-level aggregate metrics
 */
function computeSelectionAggregates(
  logbookStats: LogbookStats[],
  parsedLogbooks: ParsedLogbook[]
) {
  // Crew averages per store (average preference satisfaction across all days)
  // Use aggregateStats.percentMet from each logbook instead of individual crew stats
  const allPercentMet = parsedLogbooks.map(lb => lb.aggregateStats.percentMet);
  const preferencesMetPctAvg = allPercentMet.length > 0 ? mean(allPercentMet) : 0;

  // Role averages (enforced roles only) - use fairness snapshots
  const enforcedRoleFairnessIndices: number[] = [];

  for (const lb of parsedLogbooks) {
    for (const [roleId, snapshot] of Array.from(lb.roleFairnessSnapshots.entries())) {
      const role = lb.roles.find(r => r.roleId === roleId);
      if (role?.isEnforced) {
        enforcedRoleFairnessIndices.push(snapshot.fairnessIndex);
      }
    }
  }

  let fairnessIndexPctAvgEnforcedOnly: number | null = null;
  if (enforcedRoleFairnessIndices.length > 0) {
    fairnessIndexPctAvgEnforcedOnly = mean(enforcedRoleFairnessIndices);
  }

  return {
    crewAveragesPerStore: {
      preferencesMetPctAvg,
    },
    roleAveragesPerStore: {
      fairnessIndexPctAvgEnforcedOnly,
    },
  };
}
