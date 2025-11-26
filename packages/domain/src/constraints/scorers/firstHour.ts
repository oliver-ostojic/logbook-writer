/**
 * FIRST_HOUR preference scorer
 * 
 * Scores crew assignments based on whether they are assigned to their preferred role
 * in the first hour (first slot) of their shift.
 */

import type { SolverAssignment, PreferenceConfig, CrewConfig, ScoreResult } from '../types';

/**
 * Score FIRST_HOUR preference satisfaction
 * 
 * For each crew with a FIRST_HOUR preference:
 * - Find their first assignment (earliest start time)
 * - If it matches their preferred role, award points based on weight
 * - Score = baseWeight * crewWeight * adaptiveBoost
 * 
 * @param assignments - All assignments for the schedule
 * @param preferences - Preference configurations
 * @param crew - Crew configurations
 * @returns Score result with total score and details
 */
export function scoreFirstHourPreferences(
  assignments: SolverAssignment[],
  preferences: PreferenceConfig[],
  crew: CrewConfig[]
): ScoreResult {
  const firstHourPrefs = preferences.filter(p => p.preferenceType === 'FIRST_HOUR');
  
  if (firstHourPrefs.length === 0) {
    return { score: 0, details: 'No FIRST_HOUR preferences configured' };
  }

  let totalScore = 0;
  const satisfiedCount: number[] = [];
  const unsatisfiedCount: number[] = [];

  for (const pref of firstHourPrefs) {
    const result = scoreCrewFirstHour(pref, assignments);
    totalScore += result.score;
    
    if (result.satisfied) {
      satisfiedCount.push(result.score);
    } else {
      unsatisfiedCount.push(0);
    }
  }

  const details = `FIRST_HOUR: ${satisfiedCount.length}/${firstHourPrefs.length} satisfied, total score: ${totalScore.toFixed(1)}`;
  
  return { score: totalScore, details };
}

/**
 * Score a single crew's FIRST_HOUR preference
 */
export function scoreCrewFirstHour(
  preference: PreferenceConfig,
  assignments: SolverAssignment[]
): { score: number; satisfied: boolean; details?: string } {
  // Find all assignments for this crew
  const crewAssignments = assignments
    .filter(a => a.crewId === preference.crewId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (crewAssignments.length === 0) {
    return { 
      score: 0, 
      satisfied: false, 
      details: 'No assignments for crew' 
    };
  }

  // Get the first assignment (earliest start time)
  const firstAssignment = crewAssignments[0];

  // Check if it matches the preferred role
  const isPreferredRole = preference.roleId === null || firstAssignment.roleId === preference.roleId;

  if (!isPreferredRole) {
    return {
      score: 0,
      satisfied: false,
      details: `First assignment role ${firstAssignment.roleId} does not match preference ${preference.roleId}`
    };
  }

  // Calculate satisfaction score
  const score = preference.baseWeight * preference.crewWeight * preference.adaptiveBoost;

  return {
    score,
    satisfied: true,
    details: `First hour preference satisfied (role ${firstAssignment.roleId})`
  };
}

/**
 * Get first hour satisfaction summary for all crew
 * 
 * Useful for debugging and reporting
 */
export function getFirstHourSatisfactionSummary(
  assignments: SolverAssignment[],
  preferences: PreferenceConfig[],
  crew: CrewConfig[]
): {
  totalPreferences: number;
  satisfied: number;
  unsatisfied: number;
  totalScore: number;
  averageScore: number;
  crewDetails: Array<{
    crewId: string;
    crewName: string;
    preferredRoleId: number | null;
    firstAssignmentRoleId: number | null;
    satisfied: boolean;
    score: number;
  }>;
} {
  const firstHourPrefs = preferences.filter(p => p.preferenceType === 'FIRST_HOUR');
  const crewMap = new Map(crew.map(c => [c.id, c]));
  
  let totalScore = 0;
  let satisfiedCount = 0;
  const crewDetails: Array<{
    crewId: string;
    crewName: string;
    preferredRoleId: number | null;
    firstAssignmentRoleId: number | null;
    satisfied: boolean;
    score: number;
  }> = [];

  for (const pref of firstHourPrefs) {
    const result = scoreCrewFirstHour(pref, assignments);
    totalScore += result.score;
    if (result.satisfied) satisfiedCount++;

    const crewAssignments = assignments
      .filter(a => a.crewId === pref.crewId)
      .sort((a, b) => a.startMinutes - b.startMinutes);
    
    const firstAssignmentRoleId = crewAssignments.length > 0 ? crewAssignments[0].roleId : null;
    const crewInfo = crewMap.get(pref.crewId);

    crewDetails.push({
      crewId: pref.crewId,
      crewName: crewInfo?.name || 'Unknown',
      preferredRoleId: pref.roleId,
      firstAssignmentRoleId,
      satisfied: result.satisfied,
      score: result.score
    });
  }

  return {
    totalPreferences: firstHourPrefs.length,
    satisfied: satisfiedCount,
    unsatisfied: firstHourPrefs.length - satisfiedCount,
    totalScore,
    averageScore: firstHourPrefs.length > 0 ? totalScore / firstHourPrefs.length : 0,
    crewDetails
  };
}

/**
 * Check if adding an assignment would satisfy a crew's FIRST_HOUR preference
 * 
 * Useful for greedy/heuristic solvers
 */
export function wouldSatisfyFirstHour(
  assignment: SolverAssignment,
  preference: PreferenceConfig,
  existingAssignments: SolverAssignment[]
): boolean {
  // Must be for the same crew
  if (assignment.crewId !== preference.crewId) {
    return false;
  }

  // Must match preferred role (if specified)
  if (preference.roleId !== null && assignment.roleId !== preference.roleId) {
    return false;
  }

  // Check if this would be the first assignment
  const crewAssignments = existingAssignments.filter(a => a.crewId === preference.crewId);
  
  if (crewAssignments.length === 0) {
    // This will be the first assignment
    return true;
  }

  // Check if this starts earlier than existing assignments
  const earliestExisting = Math.min(...crewAssignments.map(a => a.startMinutes));
  return assignment.startMinutes < earliestExisting;
}
