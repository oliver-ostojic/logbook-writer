/**
 * TIMING preference scorer
 * 
 * Scores crew assignments based on break timing preferences.
 * Crew can prefer earlier breaks (-1) or later breaks (+1) within
 * the allowed break window (3-4.5 hours from shift start).
 * 
 * Score is proportional to how close the break is to the preferred timing.
 */

import type { SolverAssignment, PreferenceConfig, StoreConfig, ScoreResult } from '../types';

/**
 * Score TIMING preference satisfaction
 * 
 * For each crew with a TIMING preference:
 * - Find their break assignment (if any)
 * - Calculate where it falls in the break window (3-4.5 hrs from shift start)
 * - Score based on proximity to preferred timing (early vs late)
 * - intValue: -1 = prefer early breaks, +1 = prefer late breaks
 * 
 * @param assignments - All assignments for the schedule
 * @param preferences - Preference configurations
 * @param storeConfig - Store configuration (break window settings)
 * @param breakRoleIds - IDs of roles that are considered breaks
 * @returns Score result with total score and details
 */
export function scoreTimingPreferences(
  assignments: SolverAssignment[],
  preferences: PreferenceConfig[],
  storeConfig: StoreConfig,
  breakRoleIds: number[]
): ScoreResult {
  const timingPrefs = preferences.filter(p => p.preferenceType === 'TIMING');
  
  if (timingPrefs.length === 0) {
    return { score: 0, details: 'No TIMING preferences configured' };
  }

  let totalScore = 0;
  let satisfiedCount = 0;
  let noBreakCount = 0;

  for (const pref of timingPrefs) {
    const result = scoreCrewTiming(pref, assignments, storeConfig, breakRoleIds);
    totalScore += result.score;
    
    if (result.hasBreak) {
      if (result.score > 0) {
        satisfiedCount++;
      }
    } else {
      noBreakCount++;
    }
  }

  const details = `TIMING: ${satisfiedCount}/${timingPrefs.length - noBreakCount} with breaks satisfied, ${noBreakCount} no break, total score: ${totalScore.toFixed(1)}`;
  
  return { score: totalScore, details };
}

/**
 * Score a single crew's TIMING preference
 */
export function scoreCrewTiming(
  preference: PreferenceConfig,
  assignments: SolverAssignment[],
  storeConfig: StoreConfig,
  breakRoleIds: number[]
): { 
  score: number; 
  hasBreak: boolean;
  breakOffset?: number;
  normalizedPosition?: number;
  details?: string;
} {
  // intValue: -1 = prefer early, +1 = prefer late, 0 or undefined = no preference
  const timingPreference = preference.intValue ?? 0;
  
  if (timingPreference === 0) {
    return { 
      score: 0, 
      hasBreak: false,
      details: 'No timing preference specified (intValue is 0)' 
    };
  }

  // Find all assignments for this crew
  const crewAssignments = assignments
    .filter(a => a.crewId === preference.crewId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (crewAssignments.length === 0) {
    return { 
      score: 0, 
      hasBreak: false,
      details: 'No assignments for crew' 
    };
  }

  // Find shift start (first assignment)
  const shiftStart = crewAssignments[0].startMinutes;
  const shiftEnd = crewAssignments[crewAssignments.length - 1].endMinutes;
  const shiftLength = shiftEnd - shiftStart;

  // Check if shift requires a break
  if (shiftLength < storeConfig.reqShiftLengthForBreak) {
    return {
      score: 0,
      hasBreak: false,
      details: `Shift too short for break (${shiftLength} < ${storeConfig.reqShiftLengthForBreak} minutes)`
    };
  }

  // Find break assignment
  const breakAssignment = crewAssignments.find(a => breakRoleIds.includes(a.roleId));
  
  if (!breakAssignment) {
    return {
      score: 0,
      hasBreak: false,
      details: 'No break assignment found'
    };
  }

  // Calculate break window
  const earliestBreakStart = shiftStart + storeConfig.breakWindowStart;
  const latestBreakStart = shiftStart + storeConfig.breakWindowEnd;
  const windowSize = latestBreakStart - earliestBreakStart;

  if (windowSize <= 0) {
    return {
      score: 0,
      hasBreak: true,
      details: 'Invalid break window (start >= end)'
    };
  }

  // Calculate where break falls in the window (0 = earliest, 1 = latest)
  const breakOffset = breakAssignment.startMinutes - earliestBreakStart;
  const normalizedPosition = Math.max(0, Math.min(1, breakOffset / windowSize));

  // Calculate satisfaction score
  let satisfactionRate: number;
  
  if (timingPreference > 0) {
    // Prefer late breaks: score increases with position (0 -> 1)
    satisfactionRate = normalizedPosition;
  } else {
    // Prefer early breaks: score decreases with position (1 -> 0)
    satisfactionRate = 1 - normalizedPosition;
  }

  const maxScore = preference.baseWeight * preference.crewWeight * preference.adaptiveBoost;
  const score = satisfactionRate * maxScore;

  const timingDesc = timingPreference > 0 ? 'late' : 'early';
  const positionDesc = (normalizedPosition * 100).toFixed(1);

  return {
    score,
    hasBreak: true,
    breakOffset,
    normalizedPosition,
    details: `Break at ${positionDesc}% through window (prefers ${timingDesc}), satisfaction: ${(satisfactionRate * 100).toFixed(1)}%`
  };
}

/**
 * Get timing satisfaction summary for all crew
 * 
 * Useful for debugging and reporting
 */
export function getTimingSatisfactionSummary(
  assignments: SolverAssignment[],
  preferences: PreferenceConfig[],
  storeConfig: StoreConfig,
  breakRoleIds: number[]
): {
  totalPreferences: number;
  crewWithBreaks: number;
  crewWithoutBreaks: number;
  totalScore: number;
  averageScore: number;
  crewDetails: Array<{
    crewId: string;
    preferredTiming: 'early' | 'late' | 'none';
    hasBreak: boolean;
    breakPosition?: number; // 0-1 scale
    satisfactionRate?: number; // 0-1 scale
    score: number;
  }>;
} {
  const timingPrefs = preferences.filter(p => p.preferenceType === 'TIMING');
  
  let totalScore = 0;
  let crewWithBreaks = 0;
  const crewDetails: Array<{
    crewId: string;
    preferredTiming: 'early' | 'late' | 'none';
    hasBreak: boolean;
    breakPosition?: number;
    satisfactionRate?: number;
    score: number;
  }> = [];

  for (const pref of timingPrefs) {
    const result = scoreCrewTiming(pref, assignments, storeConfig, breakRoleIds);
    totalScore += result.score;
    if (result.hasBreak) crewWithBreaks++;

    const timingPref = (pref.intValue ?? 0) > 0 ? 'late' : (pref.intValue ?? 0) < 0 ? 'early' : 'none';
    
    let satisfactionRate: number | undefined;
    if (result.hasBreak && result.normalizedPosition !== undefined && pref.intValue !== undefined && pref.intValue !== 0) {
      satisfactionRate = pref.intValue > 0 
        ? result.normalizedPosition 
        : 1 - result.normalizedPosition;
    }

    crewDetails.push({
      crewId: pref.crewId,
      preferredTiming: timingPref,
      hasBreak: result.hasBreak,
      breakPosition: result.normalizedPosition,
      satisfactionRate,
      score: result.score
    });
  }

  return {
    totalPreferences: timingPrefs.length,
    crewWithBreaks,
    crewWithoutBreaks: timingPrefs.length - crewWithBreaks,
    totalScore,
    averageScore: crewWithBreaks > 0 ? totalScore / crewWithBreaks : 0,
    crewDetails
  };
}

/**
 * Calculate optimal break position for crew's timing preference
 * 
 * Returns the start time (in minutes from midnight) where a break should
 * ideally be placed to maximize the crew's timing preference satisfaction
 */
export function getOptimalBreakPosition(
  crewId: string,
  shiftStartMin: number,
  preference: PreferenceConfig,
  storeConfig: StoreConfig
): number {
  const timingPref = preference.intValue ?? 0;
  
  const earliestBreakStart = shiftStartMin + storeConfig.breakWindowStart;
  const latestBreakStart = shiftStartMin + storeConfig.breakWindowEnd;
  
  if (timingPref > 0) {
    // Prefer late: return latest possible start
    return latestBreakStart;
  } else if (timingPref < 0) {
    // Prefer early: return earliest possible start
    return earliestBreakStart;
  } else {
    // No preference: return middle
    return earliestBreakStart + (latestBreakStart - earliestBreakStart) / 2;
  }
}

/**
 * Check if a break assignment would satisfy timing preference
 * 
 * Returns true if the break is positioned to give >50% satisfaction
 */
export function wouldSatisfyTiming(
  breakAssignment: SolverAssignment,
  preference: PreferenceConfig,
  shiftStartMin: number,
  storeConfig: StoreConfig
): boolean {
  const timingPref = preference.intValue ?? 0;
  
  if (timingPref === 0) {
    return true; // No preference = always satisfied
  }

  const earliestBreakStart = shiftStartMin + storeConfig.breakWindowStart;
  const latestBreakStart = shiftStartMin + storeConfig.breakWindowEnd;
  const windowSize = latestBreakStart - earliestBreakStart;

  if (windowSize <= 0) {
    return false;
  }

  const breakOffset = breakAssignment.startMinutes - earliestBreakStart;
  const normalizedPosition = Math.max(0, Math.min(1, breakOffset / windowSize));

  let satisfactionRate: number;
  if (timingPref > 0) {
    satisfactionRate = normalizedPosition;
  } else {
    satisfactionRate = 1 - normalizedPosition;
  }

  return satisfactionRate > 0.5;
}
