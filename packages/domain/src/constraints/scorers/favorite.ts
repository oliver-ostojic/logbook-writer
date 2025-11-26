/**
 * FAVORITE preference scorer
 * 
 * Scores crew assignments based on how many slots/minutes they are assigned
 * to their favorite role throughout their entire shift.
 * 
 * Unlike FIRST_HOUR which only cares about the first assignment, FAVORITE
 * rewards every minute spent on the preferred role.
 */

import type { SolverAssignment, PreferenceConfig, CrewConfig, ScoreResult } from '../types';

/**
 * Score FAVORITE preference satisfaction
 * 
 * For each crew with a FAVORITE preference:
 * - Count total minutes assigned to their preferred role
 * - Score = (minutes on preferred role) * baseWeight * crewWeight * adaptiveBoost
 * 
 * @param assignments - All assignments for the schedule
 * @param preferences - Preference configurations
 * @param crew - Crew configurations
 * @returns Score result with total score and details
 */
export function scoreFavoritePreferences(
  assignments: SolverAssignment[],
  preferences: PreferenceConfig[],
  crew: CrewConfig[]
): ScoreResult {
  const favoritePrefs = preferences.filter(p => p.preferenceType === 'FAVORITE');
  
  if (favoritePrefs.length === 0) {
    return { score: 0, details: 'No FAVORITE preferences configured' };
  }

  let totalScore = 0;
  let totalMinutesOnFavorite = 0;
  let totalPossibleMinutes = 0;

  for (const pref of favoritePrefs) {
    const result = scoreCrewFavorite(pref, assignments);
    totalScore += result.score;
    totalMinutesOnFavorite += result.minutesOnFavorite;
    totalPossibleMinutes += result.totalMinutes;
  }

  const satisfactionRate = totalPossibleMinutes > 0 
    ? (totalMinutesOnFavorite / totalPossibleMinutes * 100).toFixed(1)
    : '0.0';

  const details = `FAVORITE: ${totalMinutesOnFavorite}/${totalPossibleMinutes} minutes (${satisfactionRate}%), total score: ${totalScore.toFixed(1)}`;
  
  return { score: totalScore, details };
}

/**
 * Score a single crew's FAVORITE preference
 */
export function scoreCrewFavorite(
  preference: PreferenceConfig,
  assignments: SolverAssignment[]
): { 
  score: number; 
  minutesOnFavorite: number; 
  totalMinutes: number;
  details?: string;
} {
  // Find all assignments for this crew
  const crewAssignments = assignments.filter(a => a.crewId === preference.crewId);

  if (crewAssignments.length === 0) {
    return { 
      score: 0, 
      minutesOnFavorite: 0,
      totalMinutes: 0,
      details: 'No assignments for crew' 
    };
  }

  // Calculate total minutes and minutes on preferred role
  let totalMinutes = 0;
  let minutesOnFavorite = 0;

  for (const assignment of crewAssignments) {
    const duration = assignment.endMinutes - assignment.startMinutes;
    totalMinutes += duration;

    // Check if this assignment is for the preferred role
    const isPreferredRole = preference.roleId === null || assignment.roleId === preference.roleId;
    
    if (isPreferredRole) {
      minutesOnFavorite += duration;
    }
  }

  // Calculate satisfaction score
  // Score per minute on favorite role = baseWeight * crewWeight * adaptiveBoost
  const scorePerMinute = preference.baseWeight * preference.crewWeight * preference.adaptiveBoost;
  const score = minutesOnFavorite * scorePerMinute;

  const percentage = totalMinutes > 0 ? (minutesOnFavorite / totalMinutes * 100).toFixed(1) : '0.0';

  return {
    score,
    minutesOnFavorite,
    totalMinutes,
    details: `${minutesOnFavorite}/${totalMinutes} minutes on favorite role (${percentage}%)`
  };
}

/**
 * Get favorite role satisfaction summary for all crew
 * 
 * Useful for debugging and reporting
 */
export function getFavoriteSatisfactionSummary(
  assignments: SolverAssignment[],
  preferences: PreferenceConfig[],
  crew: CrewConfig[]
): {
  totalPreferences: number;
  totalScore: number;
  totalMinutesOnFavorite: number;
  totalMinutesPossible: number;
  overallSatisfactionRate: number;
  crewDetails: Array<{
    crewId: string;
    crewName: string;
    preferredRoleId: number | null;
    minutesOnFavorite: number;
    totalMinutes: number;
    satisfactionRate: number;
    score: number;
  }>;
} {
  const favoritePrefs = preferences.filter(p => p.preferenceType === 'FAVORITE');
  const crewMap = new Map(crew.map(c => [c.id, c]));
  
  let totalScore = 0;
  let totalMinutesOnFavorite = 0;
  let totalMinutesPossible = 0;
  
  const crewDetails: Array<{
    crewId: string;
    crewName: string;
    preferredRoleId: number | null;
    minutesOnFavorite: number;
    totalMinutes: number;
    satisfactionRate: number;
    score: number;
  }> = [];

  for (const pref of favoritePrefs) {
    const result = scoreCrewFavorite(pref, assignments);
    totalScore += result.score;
    totalMinutesOnFavorite += result.minutesOnFavorite;
    totalMinutesPossible += result.totalMinutes;

    const crewInfo = crewMap.get(pref.crewId);
    const satisfactionRate = result.totalMinutes > 0 
      ? (result.minutesOnFavorite / result.totalMinutes) 
      : 0;

    crewDetails.push({
      crewId: pref.crewId,
      crewName: crewInfo?.name || 'Unknown',
      preferredRoleId: pref.roleId,
      minutesOnFavorite: result.minutesOnFavorite,
      totalMinutes: result.totalMinutes,
      satisfactionRate,
      score: result.score
    });
  }

  const overallSatisfactionRate = totalMinutesPossible > 0 
    ? (totalMinutesOnFavorite / totalMinutesPossible) 
    : 0;

  return {
    totalPreferences: favoritePrefs.length,
    totalScore,
    totalMinutesOnFavorite,
    totalMinutesPossible,
    overallSatisfactionRate,
    crewDetails
  };
}

/**
 * Calculate how much an assignment would contribute to favorite preference score
 * 
 * Useful for greedy/heuristic solvers
 */
export function getAssignmentFavoriteScore(
  assignment: SolverAssignment,
  preference: PreferenceConfig
): number {
  // Must be for the same crew
  if (assignment.crewId !== preference.crewId) {
    return 0;
  }

  // Must match preferred role (if specified)
  if (preference.roleId !== null && assignment.roleId !== preference.roleId) {
    return 0;
  }

  // Calculate score contribution
  const duration = assignment.endMinutes - assignment.startMinutes;
  const scorePerMinute = preference.baseWeight * preference.crewWeight * preference.adaptiveBoost;
  
  return duration * scorePerMinute;
}

/**
 * Get potential favorite role score for a crew across all their assignments
 * 
 * Useful for determining if crew would benefit from role changes
 */
export function getPotentialFavoriteScore(
  crewId: string,
  roleId: number,
  assignments: SolverAssignment[],
  preference: PreferenceConfig
): number {
  if (crewId !== preference.crewId) {
    return 0;
  }

  if (preference.roleId !== null && roleId !== preference.roleId) {
    return 0;
  }

  // Calculate total minutes this crew could work
  const crewAssignments = assignments.filter(a => a.crewId === crewId);
  const totalMinutes = crewAssignments.reduce(
    (sum, a) => sum + (a.endMinutes - a.startMinutes), 
    0
  );

  const scorePerMinute = preference.baseWeight * preference.crewWeight * preference.adaptiveBoost;
  
  return totalMinutes * scorePerMinute;
}
