/**
 * CONSECUTIVE preference scorer
 * 
 * Scores crew assignments based on role continuity preferences.
 * Crew can prefer to stay on the same role for consecutive slots
 * rather than switching back and forth between roles.
 * 
 * This is implemented as a penalty system: switches are penalized,
 * so fewer switches = higher score.
 */

import type { SolverAssignment, PreferenceConfig, StoreConfig, ScoreResult } from '../types';

/**
 * Score CONSECUTIVE preference satisfaction
 * 
 * For each crew with a CONSECUTIVE preference:
 * - Count role switches (transitions between different roles)
 * - Apply penalty for each switch
 * - Score is negative penalty (fewer switches = higher score)
 * 
 * The preference roleId indicates which role they want to stay on:
 * - If roleId is set, penalize switches away from that specific role
 * - If roleId is null, penalize all role switches
 * 
 * @param assignments - All assignments for the schedule
 * @param preferences - Preference configurations
 * @param storeConfig - Store configuration (for slot size)
 * @returns Score result with total score (negative = penalties) and details
 */
export function scoreConsecutivePreferences(
  assignments: SolverAssignment[],
  preferences: PreferenceConfig[],
  storeConfig: StoreConfig
): ScoreResult {
  const consecutivePrefs = preferences.filter(p => p.preferenceType === 'CONSECUTIVE');
  
  if (consecutivePrefs.length === 0) {
    return { score: 0, details: 'No CONSECUTIVE preferences configured' };
  }

  let totalScore = 0;
  let totalSwitches = 0;

  for (const pref of consecutivePrefs) {
    const result = scoreCrewConsecutive(pref, assignments, storeConfig);
    totalScore += result.score;
    totalSwitches += result.switches;
  }

  const details = `CONSECUTIVE: ${totalSwitches} role switches, penalty score: ${totalScore.toFixed(1)}`;
  
  return { score: totalScore, details };
}

/**
 * Score a single crew's CONSECUTIVE preference
 */
export function scoreCrewConsecutive(
  preference: PreferenceConfig,
  assignments: SolverAssignment[],
  storeConfig: StoreConfig
): { 
  score: number; 
  switches: number;
  consecutiveBlocks?: number;
  details?: string;
} {
  // Find all assignments for this crew, sorted by time
  const crewAssignments = assignments
    .filter(a => a.crewId === preference.crewId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (crewAssignments.length === 0) {
    return { 
      score: 0, 
      switches: 0,
      consecutiveBlocks: 0,
      details: 'No assignments for crew' 
    };
  }

  // Count role switches
  const switches = countRoleSwitches(crewAssignments, preference.roleId, storeConfig);
  
  // Calculate penalty
  const penaltyPerSwitch = preference.baseWeight * preference.crewWeight * preference.adaptiveBoost;
  const score = switches.count === 0 ? 0 : -switches.count * penaltyPerSwitch;

  return {
    score,
    switches: switches.count,
    consecutiveBlocks: switches.blocks,
    details: `${switches.count} switches (${switches.blocks} consecutive blocks), penalty: ${Math.abs(score).toFixed(1)}`
  };
}

/**
 * Count role switches for a crew
 * 
 * A switch occurs when consecutive slots have different roles.
 * If preferredRoleId is specified, only count switches involving that role.
 */
function countRoleSwitches(
  assignments: SolverAssignment[],
  preferredRoleId: number | null,
  storeConfig: StoreConfig
): { 
  count: number; 
  blocks: number;
  switchPoints: Array<{ fromRole: number; toRole: number; atMinute: number }>;
} {
  if (assignments.length <= 1) {
    return { count: 0, blocks: assignments.length, switchPoints: [] };
  }

  let switchCount = 0;
  let blockCount = 1; // Start with first block
  const switchPoints: Array<{ fromRole: number; toRole: number; atMinute: number }> = [];

  for (let i = 0; i < assignments.length - 1; i++) {
    const current = assignments[i];
    const next = assignments[i + 1];

    // Check if these assignments are consecutive (no gap)
    const isConsecutive = current.endMinutes === next.startMinutes;
    
    if (!isConsecutive) {
      // Gap in schedule, start a new block
      blockCount++;
      continue;
    }

    // Check if role changed
    const roleChanged = current.roleId !== next.roleId;
    
    if (roleChanged) {
      // Determine if this switch should be penalized
      let shouldPenalize = false;

      if (preferredRoleId === null) {
        // Penalize all switches
        shouldPenalize = true;
      } else {
        // Only penalize switches involving the preferred role
        shouldPenalize = current.roleId === preferredRoleId || next.roleId === preferredRoleId;
      }

      if (shouldPenalize) {
        switchCount++;
        switchPoints.push({
          fromRole: current.roleId,
          toRole: next.roleId,
          atMinute: next.startMinutes
        });
      }
      
      blockCount++;
    }
  }

  return { count: switchCount, blocks: blockCount, switchPoints };
}

/**
 * Get consecutive preference satisfaction summary for all crew
 */
export function getConsecutiveSatisfactionSummary(
  assignments: SolverAssignment[],
  preferences: PreferenceConfig[],
  storeConfig: StoreConfig
): {
  totalPreferences: number;
  totalSwitches: number;
  totalBlocks: number;
  totalScore: number;
  averageSwitchesPerCrew: number;
  crewDetails: Array<{
    crewId: string;
    preferredRoleId: number | null;
    switches: number;
    consecutiveBlocks: number;
    score: number;
  }>;
} {
  const consecutivePrefs = preferences.filter(p => p.preferenceType === 'CONSECUTIVE');
  
  let totalScore = 0;
  let totalSwitches = 0;
  let totalBlocks = 0;
  
  const crewDetails: Array<{
    crewId: string;
    preferredRoleId: number | null;
    switches: number;
    consecutiveBlocks: number;
    score: number;
  }> = [];

  for (const pref of consecutivePrefs) {
    const result = scoreCrewConsecutive(pref, assignments, storeConfig);
    totalScore += result.score;
    totalSwitches += result.switches;
    totalBlocks += (result.consecutiveBlocks ?? 0);

    crewDetails.push({
      crewId: pref.crewId,
      preferredRoleId: pref.roleId,
      switches: result.switches,
      consecutiveBlocks: result.consecutiveBlocks ?? 0,
      score: result.score
    });
  }

  return {
    totalPreferences: consecutivePrefs.length,
    totalSwitches,
    totalBlocks,
    totalScore,
    averageSwitchesPerCrew: consecutivePrefs.length > 0 ? totalSwitches / consecutivePrefs.length : 0,
    crewDetails
  };
}

/**
 * Calculate how many switches would occur with a new assignment
 * 
 * Useful for greedy/heuristic solvers to minimize switches
 */
export function countSwitchesWithNewAssignment(
  newAssignment: SolverAssignment,
  existingAssignments: SolverAssignment[],
  preferredRoleId: number | null,
  storeConfig: StoreConfig
): number {
  // Combine and sort all assignments
  const allAssignments = [...existingAssignments, newAssignment]
    .filter(a => a.crewId === newAssignment.crewId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const result = countRoleSwitches(allAssignments, preferredRoleId, storeConfig);
  return result.count;
}

/**
 * Get the longest consecutive block of a specific role
 * 
 * Useful for analyzing schedule quality
 */
export function getLongestConsecutiveBlock(
  crewId: string,
  roleId: number,
  assignments: SolverAssignment[]
): { 
  duration: number; 
  startMinute: number; 
  endMinute: number;
} | null {
  const crewAssignments = assignments
    .filter(a => a.crewId === crewId && a.roleId === roleId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (crewAssignments.length === 0) {
    return null;
  }

  let longestBlock = {
    duration: 0,
    startMinute: 0,
    endMinute: 0
  };

  let currentBlockStart = crewAssignments[0].startMinutes;
  let currentBlockEnd = crewAssignments[0].endMinutes;

  for (let i = 1; i < crewAssignments.length; i++) {
    const prev = crewAssignments[i - 1];
    const curr = crewAssignments[i];

    if (prev.endMinutes === curr.startMinutes) {
      // Consecutive, extend current block
      currentBlockEnd = curr.endMinutes;
    } else {
      // Gap, finalize current block and start new one
      const blockDuration = currentBlockEnd - currentBlockStart;
      if (blockDuration > longestBlock.duration) {
        longestBlock = {
          duration: blockDuration,
          startMinute: currentBlockStart,
          endMinute: currentBlockEnd
        };
      }
      currentBlockStart = curr.startMinutes;
      currentBlockEnd = curr.endMinutes;
    }
  }

  // Check final block
  const finalBlockDuration = currentBlockEnd - currentBlockStart;
  if (finalBlockDuration > longestBlock.duration) {
    longestBlock = {
      duration: finalBlockDuration,
      startMinute: currentBlockStart,
      endMinute: currentBlockEnd
    };
  }

  return longestBlock.duration > 0 ? longestBlock : null;
}

/**
 * Get all consecutive blocks for a crew
 * 
 * A block is a sequence of assignments with the same role and no gaps
 */
export function getConsecutiveBlocks(
  crewId: string,
  assignments: SolverAssignment[]
): Array<{
  roleId: number;
  startMinute: number;
  endMinute: number;
  duration: number;
  assignmentCount: number;
}> {
  const crewAssignments = assignments
    .filter(a => a.crewId === crewId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (crewAssignments.length === 0) {
    return [];
  }

  const blocks: Array<{
    roleId: number;
    startMinute: number;
    endMinute: number;
    duration: number;
    assignmentCount: number;
  }> = [];

  let currentBlock = {
    roleId: crewAssignments[0].roleId,
    startMinute: crewAssignments[0].startMinutes,
    endMinute: crewAssignments[0].endMinutes,
    assignmentCount: 1
  };

  for (let i = 1; i < crewAssignments.length; i++) {
    const prev = crewAssignments[i - 1];
    const curr = crewAssignments[i];

    const isConsecutive = prev.endMinutes === curr.startMinutes;
    const sameRole = prev.roleId === curr.roleId;

    if (isConsecutive && sameRole) {
      // Extend current block
      currentBlock.endMinute = curr.endMinutes;
      currentBlock.assignmentCount++;
    } else {
      // Finalize current block and start new one
      blocks.push({
        ...currentBlock,
        duration: currentBlock.endMinute - currentBlock.startMinute
      });

      currentBlock = {
        roleId: curr.roleId,
        startMinute: curr.startMinutes,
        endMinute: curr.endMinutes,
        assignmentCount: 1
      };
    }
  }

  // Add final block
  blocks.push({
    ...currentBlock,
    duration: currentBlock.endMinute - currentBlock.startMinute
  });

  return blocks;
}
