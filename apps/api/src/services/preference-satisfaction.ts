/**
 * Preference Satisfaction Calculator
 * 
 * Computes satisfaction scores for all preference types based on solver output.
 * Used to populate PreferenceSatisfaction and LogPreferenceMetadata tables.
 */

import type { PrismaClient } from '@prisma/client';
import { getGrade } from './crew-rule-satisfaction';

export interface AssignmentRecord {
  crewId: string;
  roleId: number;
  startMinutes: number;
  endMinutes: number;
}

export interface PreferenceRecord {
  id: number;
  crewId: string;
  roleId: number | null;
  preferenceType: 'FIRST_HOUR' | 'FAVORITE' | 'TIMING' | 'CONSECUTIVE';
  baseWeight: number;
  crewWeight: number;
  intValue: number | null; // For TIMING (-1/+1) and CONSECUTIVE
}

export interface CrewShiftWindow {
  shiftStartMin: number;
  shiftEndMin: number;
}

export interface RoleTimingWindow {
  startOffsetMin?: number;
  endOffsetMin?: number;
}

export interface TimingPreferenceContext {
  crewShifts: Map<string, CrewShiftWindow>;
  roleWindows: Map<number, RoleTimingWindow>;
}

export interface SatisfactionResult {
  rolePreferenceId: number;
  crewId: string;
  satisfaction: number; // 0-1 scale
  met: boolean; // true if satisfaction > 0.5
  weightApplied: number; // baseWeight * crewWeight
  details?: string;
}

/**
 * Calculate FIRST_HOUR preference satisfaction
 * 
 * Binary: 1.0 if crew's first hour is on the preferred role, 0.0 otherwise
 * Aligns with solver objective which rewards preferred role in first slot.
 */
export function calculateFirstHourSatisfaction(
  preference: PreferenceRecord,
  assignments: AssignmentRecord[]
): SatisfactionResult {
  const crewAssignments = assignments
    .filter(a => a.crewId === preference.crewId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (crewAssignments.length === 0) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'No assignments for crew'
    };
  }

  const firstAssignment = crewAssignments[0];

  if (preference.roleId == null) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'FIRST_HOUR preference requires roleId'
    };
  }

  const met = firstAssignment.roleId === preference.roleId;
  const satisfaction = met ? 1.0 : 0.0;

  return {
    rolePreferenceId: preference.id,
    crewId: preference.crewId,
    satisfaction,
    met,
    weightApplied: preference.baseWeight * preference.crewWeight,
    details: `First hour roleId=${firstAssignment.roleId}, preferred roleId=${preference.roleId}`
  };
}

/**
 * Calculate FAVORITE preference satisfaction
 * 
 * Binary: 1.0 if the preferred roleId has the most hours, 0.0 otherwise
 */
export function calculateFavoriteSatisfaction(
  preference: PreferenceRecord,
  assignments: AssignmentRecord[]
): SatisfactionResult {
  const crewAssignments = assignments.filter(a => a.crewId === preference.crewId);

  if (crewAssignments.length === 0) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'No assignments for crew'
    };
  }

  if (preference.roleId === null) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'FAVORITE preference requires roleId'
    };
  }

  // Calculate hours per role
  const hoursByRole = new Map<number, number>();
  
  for (const assignment of crewAssignments) {
    const hours = (assignment.endMinutes - assignment.startMinutes) / 60;
    hoursByRole.set(
      assignment.roleId,
      (hoursByRole.get(assignment.roleId) ?? 0) + hours
    );
  }

  const favoriteHours = hoursByRole.get(preference.roleId) ?? 0;
  const maxHours = Math.max(...Array.from(hoursByRole.values()));

  const met = favoriteHours === maxHours && favoriteHours > 0;
  const satisfaction = met ? 1.0 : 0.0;

  return {
    rolePreferenceId: preference.id,
    crewId: preference.crewId,
    satisfaction,
    met,
    weightApplied: preference.baseWeight * preference.crewWeight,
    details: `Favorite role: ${favoriteHours.toFixed(1)}h, max role: ${maxHours.toFixed(1)}h`
  };
}

/**
 * Calculate TIMING preference satisfaction
 * 
 * Continuous 0-1: Based on where the preferred role falls in its allowed window
 * - intValue = -1 (prefer early): satisfaction = 1 - normalizedPosition
 * - intValue = +1 (prefer late): satisfaction = normalizedPosition
 */
export function calculateTimingSatisfaction(
  preference: PreferenceRecord,
  assignments: AssignmentRecord[],
  timingContext?: TimingPreferenceContext
): SatisfactionResult {
  const timingPreference = preference.intValue ?? 0;

  if (timingPreference === 0) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'No timing preference specified (intValue is 0)'
    };
  }

  const crewAssignments = assignments
    .filter(a => a.crewId === preference.crewId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (crewAssignments.length === 0) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'No assignments for crew'
    };
  }

  if (preference.roleId == null) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'TIMING preference requires a roleId'
    };
  }

  const targetAssignment = crewAssignments.find(a => a.roleId === preference.roleId);

  if (!targetAssignment) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'No assignment found for preferred role'
    };
  }

  const shiftWindow = timingContext?.crewShifts.get(preference.crewId) ?? {
    shiftStartMin: crewAssignments[0].startMinutes,
    shiftEndMin: crewAssignments[crewAssignments.length - 1].endMinutes,
  };

  const shiftStart = shiftWindow.shiftStartMin;
  const shiftEnd = shiftWindow.shiftEndMin;

  if (shiftEnd <= shiftStart) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'Invalid shift window for crew'
    };
  }

  const roleWindow = timingContext?.roleWindows.get(preference.roleId) ?? undefined;
  const earliestStart = shiftStart + (roleWindow?.startOffsetMin ?? 0);
  const latestStart = roleWindow?.endOffsetMin != null
    ? shiftStart + roleWindow.endOffsetMin
    : shiftEnd;

  if (latestStart <= earliestStart) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'Invalid timing window (start >= end)'
    };
  }

  const windowSize = latestStart - earliestStart;
  const offset = targetAssignment.startMinutes - earliestStart;
  const normalizedPosition = Math.max(0, Math.min(1, offset / windowSize));

  // Calculate satisfaction
  let satisfaction: number;
  if (timingPreference > 0) {
    // Prefer late assignments: score increases with position
    satisfaction = normalizedPosition;
  } else {
    // Prefer early assignments: score decreases with position
    satisfaction = 1 - normalizedPosition;
  }

  const met = satisfaction > 0.5;
  const timingDesc = timingPreference > 0 ? 'late' : 'early';
  const positionDesc = (normalizedPosition * 100).toFixed(1);

  return {
    rolePreferenceId: preference.id,
    crewId: preference.crewId,
    satisfaction,
    met,
    weightApplied: preference.baseWeight * preference.crewWeight,
    details: `Assignment at ${positionDesc}% through window (prefers ${timingDesc}), satisfaction: ${(satisfaction * 100).toFixed(1)}%`
  };
}

/**
 * Calculate CONSECUTIVE preference satisfaction
 * 
 * Continuous 0-1: Based on number of role switches
 * satisfaction = max(0, 1 - (actualSwitches / worstCaseSwitches))
 * 
 * If roleId is specified, only count switches involving that role.
 * If roleId is null, count all role switches.
 */
export function calculateConsecutiveSatisfaction(
  preference: PreferenceRecord,
  assignments: AssignmentRecord[]
): SatisfactionResult {
  const crewAssignments = assignments
    .filter(a => a.crewId === preference.crewId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (crewAssignments.length === 0) {
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 0,
      met: false,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'No assignments for crew'
    };
  }

  if (crewAssignments.length === 1) {
    // Only one assignment, no switches possible
    return {
      rolePreferenceId: preference.id,
      crewId: preference.crewId,
      satisfaction: 1.0,
      met: true,
      weightApplied: preference.baseWeight * preference.crewWeight,
      details: 'Single assignment, no switches'
    };
  }

  // Count role switches
  let switchCount = 0;

  for (let i = 0; i < crewAssignments.length - 1; i++) {
    const current = crewAssignments[i];
    const next = crewAssignments[i + 1];

    // Check if these assignments are consecutive (no gap)
    const isConsecutive = current.endMinutes === next.startMinutes;

    if (!isConsecutive) {
      // Gap in schedule, doesn't count as a switch
      continue;
    }

    // Check if role changed
    const roleChanged = current.roleId !== next.roleId;

    if (roleChanged) {
      // Determine if this switch should be penalized
      let shouldCount = false;

      if (preference.roleId === null) {
        // Count all switches
        shouldCount = true;
      } else {
        // Only count switches involving the preferred role
        shouldCount = current.roleId === preference.roleId || next.roleId === preference.roleId;
      }

      if (shouldCount) {
        switchCount++;
      }
    }
  }

  // Calculate worst case: switch every slot
  // Worst case is (number of consecutive pairs) switches
  let consecutivePairs = 0;
  for (let i = 0; i < crewAssignments.length - 1; i++) {
    if (crewAssignments[i].endMinutes === crewAssignments[i + 1].startMinutes) {
      consecutivePairs++;
    }
  }

  const worstCaseSwitches = consecutivePairs;

  // Calculate satisfaction
  let satisfaction: number;
  if (worstCaseSwitches === 0) {
    // No consecutive pairs (all gaps), perfect satisfaction
    satisfaction = 1.0;
  } else {
    satisfaction = Math.max(0, 1 - (switchCount / worstCaseSwitches));
  }

  const met = satisfaction > 0.5;

  return {
    rolePreferenceId: preference.id,
    crewId: preference.crewId,
    satisfaction,
    met,
    weightApplied: preference.baseWeight * preference.crewWeight,
    details: `${switchCount} switches out of ${worstCaseSwitches} possible, satisfaction: ${(satisfaction * 100).toFixed(1)}%`
  };
}

/**
 * Calculate satisfaction for all preferences
 */
export async function calculateAllSatisfaction(
  assignments: AssignmentRecord[],
  preferences: PreferenceRecord[],
  timingContext?: TimingPreferenceContext
): Promise<SatisfactionResult[]> {
  const results: SatisfactionResult[] = [];

  for (const pref of preferences) {
    let result: SatisfactionResult;

    switch (pref.preferenceType) {
      case 'FIRST_HOUR':
        result = calculateFirstHourSatisfaction(pref, assignments);
        break;

      case 'FAVORITE':
        result = calculateFavoriteSatisfaction(pref, assignments);
        break;

      case 'TIMING':
        result = calculateTimingSatisfaction(pref, assignments, timingContext);
        break;

      case 'CONSECUTIVE':
        result = calculateConsecutiveSatisfaction(pref, assignments);
        break;

      default:
        throw new Error(`Unknown preference type: ${pref.preferenceType}`);
    }

    results.push(result);
  }

  return results;
}

/**
 * Create PreferenceSatisfaction records in database
 */
export async function savePreferenceSatisfaction(
  prisma: PrismaClient,
  logbookId: string,
  date: Date,
  satisfactionResults: SatisfactionResult[],
  adaptiveBoosts: Map<string, number> = new Map(),
  fairnessAdjustments: Map<string, number> = new Map()
): Promise<void> {
  for (const result of satisfactionResults) {
    const adaptiveBoost = adaptiveBoosts.get(`${result.crewId}-${result.rolePreferenceId}`) ?? 1.0;
    const fairnessAdjustment = fairnessAdjustments.get(`${result.crewId}-${result.rolePreferenceId}`) ?? 0.0;

    await prisma.preferenceSatisfaction.create({
      data: {
        logbookId,
        crewId: result.crewId,
        rolePreferenceId: result.rolePreferenceId,
        date,
        satisfaction: result.satisfaction,
        met: result.met,
        weightApplied: result.weightApplied,
        adaptiveBoost,
        fairnessAdjustment,
      }
    });
  }
}

/**
 * Create LogPreferenceMetadata record
 */
export async function saveLogPreferenceMetadata(
  prisma: PrismaClient,
  logbookId: string,
  satisfactionResults: SatisfactionResult[]
): Promise<void> {
  const eligiblePreferences = satisfactionResults.length;
  const preferencesMet = satisfactionResults.filter(r => r.met).length;
  const percentMet = eligiblePreferences > 0 
    ? (preferencesMet / eligiblePreferences) * 100 
    : 0;
  
  // Average satisfaction across all eligible preferences (0-100 scale)
  const avgSatisfaction = eligiblePreferences > 0
    ? (satisfactionResults.reduce((sum, r) => sum + r.satisfaction, 0) / eligiblePreferences) * 100
    : 0;

  // Per-crew satisfaction scores
  const satisfactionByCrew = new Map<string, number[]>();
  for (const r of satisfactionResults) {
    const scores = satisfactionByCrew.get(r.crewId) ?? [];
    scores.push(r.satisfaction);
    satisfactionByCrew.set(r.crewId, scores);
  }

  // Eligible crew = those with at least 1 preference
  const eligibleCrew = satisfactionByCrew.size;
  
  // Average satisfaction per crew (average of per-crew averages, 0-100)
  const crewAverages: number[] = [];
  for (const scores of satisfactionByCrew.values()) {
    const crewAvg = scores.reduce((s, v) => s + v, 0) / scores.length;
    crewAverages.push(crewAvg * 100);
  }
  const avgSatisfactionPerCrew = crewAverages.length > 0
    ? crewAverages.reduce((s, v) => s + v, 0) / crewAverages.length
    : 0;

  // Compute fairness using Gini on per-crew satisfaction averages
  const fairnessIndex = computeFairnessIndexFromScores(crewAverages);
  
  // Get letter grade
  const fairnessGrade = getGrade(fairnessIndex);

  const data = {
    id: crypto.randomUUID(),
    logbookId,
    eligiblePreferences,
    preferencesMet,
    percentMet,
    avgSatisfaction,
    eligibleCrew,
    avgSatisfactionPerCrew,
    fairnessIndex,
    fairnessGrade,
    breakdownByRoleRule: [] as any[], // TODO: populate breakdown
  };

  await prisma.logPreferenceMetadata.create({
    data,
  });
}

/**
 * Compute Gini-based fairness index in [0,100].
 * - If no scores or all zeros: 100 (nothing to be unfair about)
 * - fairnessIndex = 100 * (1 - gini)
 */
function computeFairnessIndexFromScores(scores: number[]): number {
  const n = scores.length;
  if (n === 0) return 100;

  const sorted = [...scores].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum <= 0) return 100; // all zero or negative (shouldn't be negative) → perfectly fair

  // Gini via mean absolute difference: g = (Σ_i Σ_j |x_i - x_j|) / (2 n Σ_i x_i)
  let absDiffSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      absDiffSum += Math.abs(sorted[i] - sorted[j]);
    }
  }
  const gini = absDiffSum / (2 * n * sum);
  const fairnessIndex = Math.max(0, Math.min(100, 100 * (1 - gini)));
  return fairnessIndex;
}
