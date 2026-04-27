/**
 * Dashboard Snapshot Types
 *
 * Complete type definitions for the dashboard snapshot JSON generator.
 * All durations are stored as integer minutes (not hrs/min strings).
 *
 * IMPORTANT: Satisfaction is per-crew per-day, NOT per-shift!
 * Preferences are tracked at the crew level (e.g., FIRST_HOUR, FAVORITE, CONSECUTIVE)
 */

// ==================== INPUT TYPES (Adapter Source) ====================

export interface LogbookInput {
  logbookId: string;
  date: string; // ISO date, e.g., "2025-01-15"
  storeId: string;
  crew: CrewInput[];
  roles: RoleInput[];

  // Aggregate stats for the entire day (from LogPreferenceMetadata)
  aggregateStats: LogbookAggregateStats;

  // Per-role fairness snapshots (from RoleFairnessSnapshot)
  roleFairnessSnapshots: RoleFairnessSnapshotInput[];
}

export interface LogbookAggregateStats {
  eligiblePreferences: number;    // Total preferences across all crew
  preferencesMet: number;         // Total met
  percentMet: number;             // (preferencesMet / eligiblePreferences) * 100
  avgSatisfaction: number;        // 0-100 scale
  avgSatisfactionPerCrew: number; // Average of per-crew satisfaction scores
  eligibleCrew: number;           // Crew with ≥1 eligible preference
  fairnessIndex: number;          // Preference distribution fairness (0-100)
  fairnessGrade: string;          // A+ to F
  breakdownByRoleRule: RoleRuleBreakdown[]; // Per-rule-type stats
}

export interface RoleRuleBreakdown {
  roleRuleId: number;
  ruleType: string; // FIRST_HOUR, FAVORITE, CONSECUTIVE, etc.
  eligible: number;
  met: number;
  avgSatisfaction: number; // 0-100 scale
  percentMet: number;
}

// Per-rule-type breakdown for a single crew
export interface CrewRuleBreakdown {
  ruleType: string;   // FIRST_HOUR, FAVORITE, CONSECUTIVE, etc.
  total: number;      // How many times this rule applied for this crew
  met: number;        // How many times it was satisfied
  percentMet: number; // (met / total) * 100
}

export interface RoleFairnessSnapshotInput {
  roleId: string;
  giniCoefficient: number;      // 0 = perfect equality, 1 = max inequality
  fairnessIndex: number;        // 100 - (gini * 100)
  fairnessGrade: string;        // A+, A, B+, B, C+, C, D, F
  minMinutesPerDay: number;
  maxMinutesPerDay: number;
  avgMinutesPerDay: number;
  stdDeviation: number;
  eligibleCrew: number;         // Crew who CAN do this role
  crewWithMinutes: number;      // Crew who got minutes in lookback
  lookbackDays: number;
}

export interface CrewInput {
  crewId: string;
  crewName: string;
  assignments: AssignmentInput[]; // Changed from "shifts" to "assignments" for clarity

  // Preference data for this crew (aggregated from PreferenceSatisfaction)
  preferences: CrewPreferenceStats;
}

export interface CrewPreferenceStats {
  total: number;          // Total preferences for this crew
  met: number;            // Preferences met
  satisfaction: number;   // 0-1 scale (average of all preference satisfactions)
  breakdownByRuleType?: CrewRuleBreakdown[]; // Per-rule-type breakdown (optional for backward compat)
}

export interface AssignmentInput {
  assignmentId: string;  // Changed from "shiftId"
  roleId: string;
  roleName: string;
  startTime: string; // ISO datetime
  endTime: string;   // ISO datetime
}

export interface RoleInput {
  roleId: string;
  roleName: string;
  isEnforced: boolean; // true = fairness rules apply
}

// ==================== OUTPUT TYPES ====================

export interface DashboardSnapshot {
  meta: SnapshotMeta;
  selection: Selection;
}

export interface SnapshotMeta {
  version: 1; // Increment for breaking changes
  storeId: string;
  timezone: string; // Used for generatedAt formatting only
  generatedAt: string; // ISO datetime in specified timezone
}

export interface Selection {
  selectionId: string;
  label: string;
  selectedDates: string[]; // All requested dates, including missing
  missingDates: string[];  // Dates with no logbook data
  logbooks: LogbookStats[]; // Only dates with data (no {missing:true} objects)
  selectionAggregates: SelectionAggregates;
  selectionCrewRollups: CrewSelectionStats[];
  selectionRoleRollups: RoleSelectionStats[];
}

export interface SelectionAggregates {
  crewAveragesPerStore: {
    preferencesMetPctAvg: number; // Average satisfaction across all days
  };
  roleAveragesPerStore: {
    fairnessIndexPctAvgEnforcedOnly: number | null; // Average fairness across enforced roles
  };
}

// ==================== PER-LOGBOOK STATS ====================

export interface LogbookStats {
  logbook: {
    logbookId: string;
    date: string;
  };

  // Day-level aggregate (all crew combined)
  dayAggregate: {
    satisfactionPct: number;  // Overall day satisfaction (all crew)
    totalPreferences: number;
    preferencesMet: number;
    breakdownByRuleType: RoleRuleBreakdown[]; // Per-rule-type breakdown
  };

  crewStats: CrewLogbookStats[];
  roleStats: RoleLogbookStats[];
}

// ==================== CREW METRICS (PER DAY) ====================

export interface CrewLogbookStats {
  crewId: string;
  crewName: string;

  // Preference metrics (from PreferenceSatisfaction)
  preferencesTotal: number;    // Total preferences for this crew
  preferencesMet: number;      // Preferences met
  satisfactionPct: number;     // (preferencesMet / preferencesTotal) * 100
  avgSatisfactionPct: number;  // Average of raw satisfaction scores * 100 (continuous, shows gradient quality)

  // Satisfaction rank
  satisfactionRank: number;    // Rank by satisfactionPct desc, ties broken by crewId asc

  // Comparison to crew average
  vsCrewAvgDelta: number;      // satisfactionPct - logbookAvgSatisfactionPct (percentage points)

  // Role distribution (computed from assignments)
  avgMinutesPerAssignmentByRole: Record<string, number>; // roleId → total minutes per day on this role
  totalMinutesWorked: number;  // Total minutes across all assignments
  lastAssignedDateByRole: Record<string, string>;   // roleId → ISO date of most recent assignment

  // Assignment deviation
  avgMinutesPerAssignment: number; // Average duration of this crew's assignments
  minutesPerAssignmentDeviationFromMedianPct: number; // ((crewAvg - medianAvg) / medianAvg) * 100

  // Per-rule-type preference breakdown (for preferences met graph)
  preferenceBreakdownByRuleType: CrewRuleBreakdown[];
}

// ==================== ROLE METRICS (PER DAY) ====================

export interface RoleLogbookStats {
  roleId: string;
  roleName: string;
  isEnforced: boolean;

  // Basic metrics (computed from assignments)
  avgMinutesPerAssignment: number; // Average total minutes per crew per day (when assigned to this role)
  totalMinutesWorked: number;      // Total minutes on this role
  crewAssignedCount: number;       // Unique crew who worked this role today
  crewTotalCount: number;          // Total crew in logbook (for reference)
  eligibleCrew: number | null;     // Crew with CrewRole for this role (from RoleFairnessSnapshot)

  // Fairness metrics (from RoleFairnessSnapshot - uses lookback window!)
  fairnessScore: number | null;   // Std deviation (lower = fairer), null if not enforced
  fairnessStatus: 'excellent' | 'good' | 'ok' | 'bad' | null;
  fairnessGrade: string | null;   // A+ to F grade, null if not enforced
  giniCoefficient: number | null; // 0 = perfect equality, 1 = max inequality

  // Distribution metrics (computed from CrewRoleFairnessHistory within lookback)
  minMinutesPerDay: number | null;
  maxMinutesPerDay: number | null;
  avgMinutesPerDay: number | null;
  spreadFromMedianPct: number;    // ((max - min) / median) * 100

  // Time share
  timeSharePctAvg: number;        // (avgMinutesOnRole / avgTotalMinutesWorkedPerCrew) * 100
}

// ==================== SELECTION ROLLUPS (CROSS-DATE) ====================

// Crew rollup across selected dates
export interface CrewSelectionStats {
  crewId: string;
  crewName: string;

  // Aggregated preference metrics
  avgSatisfactionPctOverSelection: number; // Average of daily satisfactionPct values
  preferencesTotalSelection: number;       // Sum of daily totals
  preferencesMetSelection: number;         // Sum of daily met counts

  // Comparison metrics
  avgVsCrewAvgDeltaOverSelection: number;  // Average of daily vsCrewAvgDelta
  overallRankInSelection: number;          // Rank by avgSatisfactionPctOverSelection desc

  // Satisfaction time series (one point per day)
  satisfactionByDate: SatisfactionByDate[];

  // Role metrics across selection
  avgMinutesPerAssignmentByRoleSelection: Record<string, number>; // roleId → avg total minutes per day (when assigned)
  avgTimeSharePctByRoleSelection: Record<string, number>;         // roleId → (totalMin / totalWorked) * 100
  lastAssignedDateByRoleSelection: Record<string, string>;        // roleId → most recent date in selection

  // Per-rule-type preference breakdown (aggregated across selection)
  preferenceBreakdownByRuleType: CrewRuleBreakdown[];
}

export interface SatisfactionByDate {
  date: string;            // ISO date
  satisfactionPct: number; // Satisfaction for this crew on this date (binary met/total)
  avgSatisfactionPct: number; // Continuous avg satisfaction (0-100) for box plot spread
}

// Role rollup across selected dates
export interface RoleSelectionStats {
  roleId: string;
  roleName: string;
  isEnforced: boolean;

  // Crew counts
  crewWorkedOnRoleCount: number;           // Unique crew who had any assignment for this role in selection

  // Work distribution
  minutesWorkedOnRoleTotal: number;        // Sum across all crew, all selected dates
  totalMinutesWorkedSelection: number;     // Sum of ALL work (all roles) in selection
  minutesOnRoleVsTotalWorkPct: number;     // (minutesWorkedOnRoleTotal / totalMinutesWorkedSelection) * 100

  // Fairness metrics (only if isEnforced === true)
  avgFairnessIndexPct: number | null;      // Average fairness index across dates
  avgGiniCoefficient: number | null;       // Average Gini coefficient

  // Lorenz curve data for inequality visualization (computed from CrewRoleFairnessHistory)
  lorenzCurveData: LorenzCurvePoint[];

  // Distribution bucketing
  bucketDistribution: DistributionBucket[];

  // Time series data
  byDateAverages: RoleByDateAverage[];
}

export interface LorenzCurvePoint {
  populationShare: number; // 0 to 1 (cumulative % of crew)
  workShare: number;       // 0 to 1 (cumulative % of work)
}

export interface DistributionBucket {
  minInclusive: number;  // Minimum minutes (inclusive)
  maxExclusive: number;  // Maximum minutes (exclusive)
  crewCount: number;     // Number of crew in this bucket
}

export interface RoleByDateAverage {
  date: string; // ISO date
  avgMinutesPerCrewOnRole: number;
}

// ==================== INTERNAL/INTERMEDIATE TYPES ====================

/**
 * Parsed assignment with minutes instead of datetime strings
 */
export interface ParsedAssignment {
  assignmentId: string;
  roleId: string;
  roleName: string;
  startMinute: number; // Minutes from midnight
  endMinute: number;
  durationMinutes: number;
}

/**
 * Crew data with parsed assignments
 */
export interface ParsedCrew {
  crewId: string;
  crewName: string;
  assignments: ParsedAssignment[];
  preferences: CrewPreferenceStats;
}

/**
 * Parsed logbook ready for computation
 */
export interface ParsedLogbook {
  logbookId: string;
  date: string;
  storeId: string;
  crew: ParsedCrew[];
  roles: RoleInput[];
  aggregateStats: LogbookAggregateStats;
  roleFairnessSnapshots: Map<string, RoleFairnessSnapshotInput>; // roleId → snapshot
}
