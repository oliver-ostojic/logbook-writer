/**
 * Crew Rule Satisfaction Calculator
 * 
 * Computes satisfaction scores for CrewRoleRules based on solver output.
 * A CrewRoleRule is a "preference" - a rule that applies to a specific crew member.
 * StoreRoleRules are "requirements" - rules that apply to all crew at a store.
 * 
 * Each RoleRuleType has its own satisfaction logic:
 * - Binary (true/false → 1.0/0.0)
 * - Gradient (0.0 to 1.0 based on how well the rule was satisfied)
 */

import type { RoleRuleType } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface AssignmentRecord {
  crewId: string;
  roleId: number;
  startMinutes: number;  // Minutes from midnight
  endMinutes: number;    // Minutes from midnight
}

export interface CrewRoleRuleRecord {
  id: number;
  crewId: string;
  roleRuleId: number;
  valueInt: number | null;
  roleRule: {
    id: number;
    roleId: number;
    type: RoleRuleType;
    targetRoleId: number | null;
    constraintType: 'HARD' | 'SOFT';
  };
}

export interface CrewShiftWindow {
  crewId: string;
  shiftStartMin: number;
  shiftEndMin: number;
}

export interface RoleBlockSize {
  roleId: number;
  blockSize: number;  // In minutes (taskLength from Role)
}

export interface SatisfactionResult {
  crewRoleRuleId: number;
  crewId: string;
  roleId: number;
  ruleType: RoleRuleType;
  satisfaction: number;  // 0.0 to 1.0
  met: boolean;          // true if satisfaction >= 0.5
  details?: string;
}

export type SatisfactionGrade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';

export interface RoleRuleBreakdown {
  roleRuleId: number;
  ruleType: RoleRuleType;
  eligible: number;
  met: number;
  avgSatisfaction: number;
  percentMet: number;
}

export interface CrewBreakdown {
  crewId: string;
  total: number;
  met: number;
  avgSatisfaction: number;
  satisfactionPct: number;
}

// Per-crew, per-rule-type breakdown for individual crew preferences graphs
export interface CrewRuleTypeBreakdown {
  crewId: string;
  ruleType: RoleRuleType;
  total: number;
  met: number;
  percentMet: number;
}

export interface AggregatedSatisfactionStats {
  // Core metrics
  eligiblePreferences: number;
  preferencesMet: number;
  percentMet: number;
  avgSatisfaction: number;

  // Crew metrics
  eligibleCrew: number;
  avgSatisfactionPerCrew: number;

  // Fairness
  fairnessIndex: number;
  fairnessGrade: SatisfactionGrade;

  // Per-RoleRule breakdown
  breakdownByRoleRule: RoleRuleBreakdown[];

  // Per-Crew breakdown
  breakdownByCrew: CrewBreakdown[];

  // Per-Crew per-RuleType breakdown (for crew preferences graphs)
  breakdownByCrewAndRuleType: CrewRuleTypeBreakdown[];
}

/**
 * Get letter grade for a percentage score (0-100 scale)
 * Uses realistic scheduling-aware ranges where 79% = B+
 */
export function getGrade(score: number): SatisfactionGrade {
  if (score >= 94) return 'A+';
  if (score >= 88) return 'A';
  if (score >= 82) return 'A-';
  if (score >= 76) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 64) return 'B-';
  if (score >= 58) return 'C+';
  if (score >= 52) return 'C';
  if (score >= 46) return 'C-';
  if (score >= 40) return 'D+';
  if (score >= 34) return 'D';
  if (score >= 28) return 'D-';
  return 'F';
}

// ============================================================================
// Main Calculator
// ============================================================================

/**
 * Calculate satisfaction for all CrewRoleRules based on assignments
 */
export function calculateCrewRuleSatisfaction(
  crewRoleRules: CrewRoleRuleRecord[],
  assignments: AssignmentRecord[],
  crewShifts: Map<string, CrewShiftWindow>,
  roleBlockSizes: Map<number, number>
): SatisfactionResult[] {
  const results: SatisfactionResult[] = [];

  // Group assignments by crew for efficient lookup
  const assignmentsByCrewId = new Map<string, AssignmentRecord[]>();
  for (const a of assignments) {
    if (!assignmentsByCrewId.has(a.crewId)) {
      assignmentsByCrewId.set(a.crewId, []);
    }
    assignmentsByCrewId.get(a.crewId)!.push(a);
  }

  // Sort each crew's assignments by start time
  assignmentsByCrewId.forEach((crewAssignments) => {
    crewAssignments.sort((a, b) => a.startMinutes - b.startMinutes);
  });

  // Group rules by crew and type for special handling (LIKE/DISLIKE grouping)
  const rulesByCrewAndType = groupRulesByCrewAndType(crewRoleRules);

  // Process each crew's rules
  for (const rule of crewRoleRules) {
    const crewAssignments = assignmentsByCrewId.get(rule.crewId) ?? [];
    const crewShift = crewShifts.get(rule.crewId);
    
    // Skip if crew has no assignments (they didn't work)
    if (crewAssignments.length === 0) {
      continue;
    }

    // Check if crew was assigned to the rule's role at all
    const roleAssignments = crewAssignments.filter(a => a.roleId === rule.roleRule.roleId);
    
    // For certain rule types, we need to evaluate even if the primary role wasn't assigned
    const evaluateWithoutRoleAssignment = [
      'FORBID_ROLE',
      'LIKE_ROLE_FOR_HOUR_X',
      'DISLIKE_ROLE_FOR_HOUR_X',
      'MIN_SHIFT_LENGTH_FOR_ACCESS',
      'CANNOT_ASSIGN_DURING_STORE_HOUR_X',
      'DISTRIBUTION_BETWEEN_ROLE_X',  // Need to evaluate even if only target role was assigned
      'MAX_CONSECUTIVE_MINUTES',       // Need to evaluate even if role wasn't assigned (satisfaction = 0)
      'CANNOT_BE_ASSIGNED_AFTER',      // Need to evaluate: no role = preference trivially met
    ].includes(rule.roleRule.type);

    if (roleAssignments.length === 0 && !evaluateWithoutRoleAssignment) {
      // Role wasn't assigned, skip this preference (doesn't apply)
      continue;
    }

    const result = calculateSingleRuleSatisfaction(
      rule,
      crewAssignments,
      roleAssignments,
      crewShift,
      roleBlockSizes,
      assignments,  // All assignments for MAX_CREW_ON_AT_A_TIME
      rulesByCrewAndType
    );

    if (result) {
      results.push(result);
    }
  }

  return results;
}

// ============================================================================
// Individual Rule Type Calculators
// ============================================================================

function calculateSingleRuleSatisfaction(
  rule: CrewRoleRuleRecord,
  crewAssignments: AssignmentRecord[],
  roleAssignments: AssignmentRecord[],
  crewShift: CrewShiftWindow | undefined,
  roleBlockSizes: Map<number, number>,
  allAssignments: AssignmentRecord[],
  rulesByCrewAndType: Map<string, CrewRoleRuleRecord[]>
): SatisfactionResult | null {
  const { type, roleId, targetRoleId } = rule.roleRule;
  const valueInt = rule.valueInt;

  let satisfaction: number;
  let details: string;

  switch (type) {
    case 'CANNOT_BE_ASSIGNED_BEFORE': {
      // True if roleId is NOT assigned before targetRoleId
      // e.g., REG cannot be assigned before P_HELM means if you have P_HELM, REG shouldn't come first
      if (targetRoleId === null) {
        return null;  // Need target role for this constraint
      }
      const result = calculateCannotBeAssignedBefore(roleId, targetRoleId, crewAssignments);
      satisfaction = result.satisfaction;
      details = result.details;
      break;
    }

    case 'CANNOT_BE_ASSIGNED_AFTER': {
      // True if roleId is NOT assigned after targetRoleId
      // e.g., REG cannot be assigned after P_HELM means if you had P_HELM, REG shouldn't come later
      if (targetRoleId === null) {
        return null;  // Need target role for this constraint
      }
      const result = calculateCannotBeAssignedAfter(roleId, targetRoleId, crewAssignments);
      satisfaction = result.satisfaction;
      details = result.details;
      break;
    }

    case 'MIN_CONSECUTIVE_MINUTES': {
      // True if all consecutive blocks of this role are >= valueInt minutes
      const minMinutes = valueInt ?? 0;
      const result = calculateMinConsecutiveMinutes(roleId, crewAssignments, minMinutes);
      satisfaction = result.satisfaction;
      details = result.details;
      break;
    }

    case 'MAX_CONSECUTIVE_MINUTES': {
      // True if all consecutive blocks of this role are <= valueInt minutes
      const maxMinutes = valueInt ?? Infinity;
      const result = calculateMaxConsecutiveMinutes(roleId, crewAssignments, maxMinutes);
      satisfaction = result.satisfaction;
      details = result.details;
      break;
    }

    case 'FORBID_ROLE': {
      // True if the role was NOT assigned at all
      const wasAssigned = roleAssignments.length > 0;
      satisfaction = wasAssigned ? 0.0 : 1.0;
      details = wasAssigned ? 'Role was assigned (forbidden)' : 'Role was not assigned (correct)';
      break;
    }

    case 'TIMING': {
      // Gradient based on position in shift
      // -1 = prefer early, 0 = prefer middle, +1 = prefer late
      if (!crewShift) {
        return null;  // Can't evaluate without shift info
      }
      if (roleAssignments.length === 0) {
        // Role wasn't assigned - timing preference doesn't apply, skip entirely
        return null;
      }
      const timingPref = valueInt ?? 0;
      const result = calculateTimingSatisfaction(roleAssignments, crewShift, timingPref);
      satisfaction = result.satisfaction;
      details = result.details;
      break;
    }

    case 'LIKE_ROLE_FOR_HOUR_X': {
      // valueInt is minutes from START OF SHIFT (e.g., 60 = second hour of shift)
      // Need to convert to absolute time by adding shift start
      if (!crewShift) {
        return null;  // Can't evaluate without shift info
      }
      
      const shiftRelativeMinutes = valueInt ?? 0;
      const absoluteHourStart = crewShift.shiftStartMin + shiftRelativeMinutes;
      
      // Check if this hour is within the crew's shift
      if (absoluteHourStart >= crewShift.shiftEndMin) {
        return null;  // Hour is beyond shift end, rule doesn't apply
      }
      
      const crewLikeRules = rulesByCrewAndType.get(`${rule.crewId}:LIKE_ROLE_FOR_HOUR_X`) ?? [];
      const rulesForThisHour = crewLikeRules.filter(r => r.valueInt === shiftRelativeMinutes);
      
      // Check if any of the liked roles are assigned during this hour
      const anyLikedRoleAssigned = rulesForThisHour.some(likeRule => {
        const likedRoleId = likeRule.roleRule.roleId;
        return crewAssignments.some(a => 
          a.roleId === likedRoleId && 
          assignmentOverlapsHour(a, absoluteHourStart)
        );
      });
      
      satisfaction = anyLikedRoleAssigned ? 1.0 : 0.0;
      details = anyLikedRoleAssigned 
        ? `A liked role was assigned during shift hour ${shiftRelativeMinutes / 60 + 1} (${absoluteHourStart}-${absoluteHourStart + 60}m)` 
        : `No liked roles assigned during shift hour ${shiftRelativeMinutes / 60 + 1} (${absoluteHourStart}-${absoluteHourStart + 60}m)`;
      break;
    }

    case 'DISLIKE_ROLE_FOR_HOUR_X': {
      // valueInt is minutes from START OF SHIFT (e.g., 60 = second hour of shift)
      // Need to convert to absolute time by adding shift start
      if (!crewShift) {
        return null;  // Can't evaluate without shift info
      }
      
      const shiftRelativeMinutes = valueInt ?? 0;
      const absoluteHourStart = crewShift.shiftStartMin + shiftRelativeMinutes;
      
      // Check if this hour is within the crew's shift
      if (absoluteHourStart >= crewShift.shiftEndMin) {
        return null;  // Hour is beyond shift end, rule doesn't apply
      }
      
      const dislikedRoleId = roleId;
      
      const dislikedRoleAssigned = crewAssignments.some(a => 
        a.roleId === dislikedRoleId && 
        assignmentOverlapsHour(a, absoluteHourStart)
      );
      
      satisfaction = dislikedRoleAssigned ? 0.0 : 1.0;
      details = dislikedRoleAssigned 
        ? `Disliked role ${dislikedRoleId} was assigned during shift hour ${shiftRelativeMinutes / 60 + 1} (${absoluteHourStart}-${absoluteHourStart + 60}m)` 
        : `Disliked role ${dislikedRoleId} was NOT assigned during shift hour ${shiftRelativeMinutes / 60 + 1}`;
      break;
    }

    case 'MIN_SHIFT_LENGTH_FOR_ACCESS': {
      // True if crew doesn't get the role when their shift is below the minimum
      const minShiftLength = valueInt ?? 0;
      if (!crewShift) {
        return null;  // Can't evaluate without shift info
      }
      const shiftLength = crewShift.shiftEndMin - crewShift.shiftStartMin;
      const roleWasAssigned = roleAssignments.length > 0;
      
      if (shiftLength >= minShiftLength) {
        // Shift is long enough, rule doesn't apply (satisfied by default)
        satisfaction = 1.0;
        details = `Shift length ${shiftLength} >= min ${minShiftLength}, rule N/A`;
      } else {
        // Shift too short - role should NOT be assigned
        satisfaction = roleWasAssigned ? 0.0 : 1.0;
        details = roleWasAssigned 
          ? `Shift ${shiftLength} < min ${minShiftLength}, but role was assigned (violation)`
          : `Shift ${shiftLength} < min ${minShiftLength}, role correctly not assigned`;
      }
      break;
    }

    case 'ASSIGN_BEFORE_SHIFT_MIN_X': {
      // True if the role is assigned before minute X of the shift
      const beforeMin = valueInt ?? 0;
      if (!crewShift || roleAssignments.length === 0) {
        return null;
      }
      const shiftRelativeMin = beforeMin;  // valueInt is relative to shift start
      const targetTime = crewShift.shiftStartMin + shiftRelativeMin;
      
      const assignedBefore = roleAssignments.some(a => a.startMinutes < targetTime);
      satisfaction = assignedBefore ? 1.0 : 0.0;
      details = assignedBefore 
        ? `Role assigned before shift minute ${shiftRelativeMin}` 
        : `Role NOT assigned before shift minute ${shiftRelativeMin}`;
      break;
    }

    case 'ASSIGN_AFTER_SHIFT_MIN_X': {
      // True if the role is assigned after minute X of the shift
      const afterMin = valueInt ?? 0;
      if (!crewShift || roleAssignments.length === 0) {
        return null;
      }
      const shiftRelativeMin = afterMin;
      const targetTime = crewShift.shiftStartMin + shiftRelativeMin;
      
      const assignedAfter = roleAssignments.some(a => a.startMinutes >= targetTime);
      satisfaction = assignedAfter ? 1.0 : 0.0;
      details = assignedAfter 
        ? `Role assigned after shift minute ${shiftRelativeMin}` 
        : `Role NOT assigned after shift minute ${shiftRelativeMin}`;
      break;
    }

    case 'MAX_CREW_ON_AT_A_TIME': {
      // True if at no point in time are more than valueInt crew on this role
      const maxCrew = valueInt ?? Infinity;
      const result = calculateMaxCrewOnAtATime(roleId, allAssignments, maxCrew);
      satisfaction = result.satisfaction;
      details = result.details;
      break;
    }

    case 'ALLOW_HALF_BLOCKSIZE': {
      // True if the role was assigned (half blocksize was allowed/used)
      const blockSize = roleBlockSizes.get(roleId) ?? 60;
      const halfBlockSize = blockSize / 2;
      
      // Check if any assignment uses half block size
      const usesHalfBlock = roleAssignments.some(a => 
        (a.endMinutes - a.startMinutes) === halfBlockSize
      );
      
      satisfaction = usesHalfBlock ? 1.0 : 0.0;
      details = usesHalfBlock 
        ? `Half blocksize (${halfBlockSize}min) was used` 
        : `Half blocksize was not used`;
      break;
    }

    case 'DISTRIBUTION_BETWEEN_ROLE_X': {
      // Compare time on roleId vs targetRoleId
      // -1 = roleId should have LESS time than targetRoleId
      //  0 = should be balanced
      // +1 = roleId should have MORE time than targetRoleId
      if (targetRoleId === null) {
        return null;  // Need target role for comparison
      }
      const distributionPref = valueInt ?? 0;
      const result = calculateDistribution(roleId, targetRoleId, crewAssignments, crewShift, distributionPref);
      satisfaction = result.satisfaction;
      details = result.details;
      break;
    }

    case 'CANNOT_ASSIGN_DURING_STORE_HOUR_X': {
      // True if the role is NOT assigned during hour X (valueInt) to X+60
      const hourStart = valueInt ?? 0;
      const hourEnd = hourStart + 60;
      
      const assignedDuringHour = roleAssignments.some(a => 
        a.startMinutes < hourEnd && a.endMinutes > hourStart
      );
      
      satisfaction = assignedDuringHour ? 0.0 : 1.0;
      details = assignedDuringHour 
        ? `Role was assigned during forbidden hour ${hourStart}-${hourEnd}` 
        : `Role was NOT assigned during forbidden hour ${hourStart}-${hourEnd}`;
      break;
    }

    default:
      // Unknown rule type, skip
      return null;
  }

  return {
    crewRoleRuleId: rule.id,
    crewId: rule.crewId,
    roleId: rule.roleRule.roleId,
    ruleType: type,
    satisfaction,
    met: satisfaction >= 0.5,
    details,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function groupRulesByCrewAndType(rules: CrewRoleRuleRecord[]): Map<string, CrewRoleRuleRecord[]> {
  const grouped = new Map<string, CrewRoleRuleRecord[]>();
  for (const rule of rules) {
    const key = `${rule.crewId}:${rule.roleRule.type}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(rule);
  }
  return grouped;
}

function assignmentOverlapsHour(assignment: AssignmentRecord, hourStartMinutes: number): boolean {
  const hourEnd = hourStartMinutes + 60;
  return assignment.startMinutes < hourEnd && assignment.endMinutes > hourStartMinutes;
}

function calculateCannotBeAssignedBefore(
  roleId: number,
  targetRoleId: number,
  crewAssignments: AssignmentRecord[]
): { satisfaction: number; details: string } {
  // CANNOT_BE_ASSIGNED_BEFORE: roleId cannot be assigned DIRECTLY BEFORE targetRoleId
  // This is about consecutive assignments - no roleId → targetRoleId transition
  // e.g., REG cannot be assigned before P_HELM means: no REG → P_HELM switch
  
  const roleAssignments = crewAssignments.filter(a => a.roleId === roleId);
  const targetAssignments = crewAssignments.filter(a => a.roleId === targetRoleId);
  
  // If either role is not assigned, rule is satisfied (doesn't apply)
  if (roleAssignments.length === 0 || targetAssignments.length === 0) {
    return { 
      satisfaction: 1.0, 
      details: `Rule N/A: ${roleAssignments.length === 0 ? 'roleId' : 'targetRoleId'} not assigned` 
    };
  }

  // Check if any roleId assignment ends exactly when a targetRoleId assignment starts
  // This would be a direct roleId → targetRoleId transition (violation)
  for (const roleAssign of roleAssignments) {
    for (const targetAssign of targetAssignments) {
      if (roleAssign.endMinutes === targetAssign.startMinutes) {
        return { 
          satisfaction: 0.0, 
          details: `Violation: role ${roleId} directly precedes target role ${targetRoleId} at minute ${roleAssign.endMinutes}` 
        };
      }
    }
  }

  return { 
    satisfaction: 1.0, 
    details: `No direct ${roleId} → ${targetRoleId} transition (correct)` 
  };
}

function calculateCannotBeAssignedAfter(
  roleId: number,
  targetRoleId: number,
  crewAssignments: AssignmentRecord[]
): { satisfaction: number; details: string } {
  // CANNOT_BE_ASSIGNED_AFTER: roleId cannot be assigned DIRECTLY AFTER targetRoleId
  // This is about consecutive assignments - no targetRoleId → roleId transition
  // e.g., REG cannot be assigned after P_HELM means: no P_HELM → REG switch
  
  const roleAssignments = crewAssignments.filter(a => a.roleId === roleId);
  const targetAssignments = crewAssignments.filter(a => a.roleId === targetRoleId);
  
  // If either role is not assigned, rule is satisfied (doesn't apply)
  if (roleAssignments.length === 0 || targetAssignments.length === 0) {
    return { 
      satisfaction: 1.0, 
      details: `Rule N/A: ${roleAssignments.length === 0 ? 'roleId' : 'targetRoleId'} not assigned` 
    };
  }

  // Check if any targetRoleId assignment ends exactly when a roleId assignment starts
  // This would be a direct targetRoleId → roleId transition (violation)
  for (const targetAssign of targetAssignments) {
    for (const roleAssign of roleAssignments) {
      if (targetAssign.endMinutes === roleAssign.startMinutes) {
        return { 
          satisfaction: 0.0, 
          details: `Violation: role ${roleId} directly follows target role ${targetRoleId} at minute ${targetAssign.endMinutes}` 
        };
      }
    }
  }

  return { 
    satisfaction: 1.0, 
    details: `No direct ${targetRoleId} → ${roleId} transition (correct)` 
  };
}

function calculateMinConsecutiveMinutes(
  roleId: number,
  crewAssignments: AssignmentRecord[],
  minMinutes: number
): { satisfaction: number; details: string } {
  const blocks = getConsecutiveBlocks(roleId, crewAssignments);
  
  if (blocks.length === 0) {
    return { satisfaction: 1.0, details: 'No blocks of this role' };
  }

  // Check if ALL blocks meet the minimum
  const allBlocksMeetMin = blocks.every(b => b.duration >= minMinutes);
  const shortestBlock = Math.min(...blocks.map(b => b.duration));

  if (allBlocksMeetMin) {
    return { 
      satisfaction: 1.0, 
      details: `All blocks >= ${minMinutes}min (shortest: ${shortestBlock}min)` 
    };
  }

  return { 
    satisfaction: 0.0, 
    details: `Some blocks < ${minMinutes}min (shortest: ${shortestBlock}min)` 
  };
}

function calculateMaxConsecutiveMinutes(
  roleId: number,
  crewAssignments: AssignmentRecord[],
  maxMinutes: number
): { satisfaction: number; details: string } {
  const blocks = getConsecutiveBlocks(roleId, crewAssignments);
  
  if (blocks.length === 0) {
    return { satisfaction: 1.0, details: 'No blocks of this role' };
  }

  const allBlocksUnderMax = blocks.every(b => b.duration <= maxMinutes);
  const longestBlock = Math.max(...blocks.map(b => b.duration));

  if (allBlocksUnderMax) {
    return { 
      satisfaction: 1.0, 
      details: `All blocks <= ${maxMinutes}min (longest: ${longestBlock}min)` 
    };
  }

  return { 
    satisfaction: 0.0, 
    details: `Some blocks > ${maxMinutes}min (longest: ${longestBlock}min)` 
  };
}

function getConsecutiveBlocks(
  roleId: number,
  crewAssignments: AssignmentRecord[]
): { start: number; end: number; duration: number }[] {
  const roleAssignments = crewAssignments
    .filter(a => a.roleId === roleId)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (roleAssignments.length === 0) {
    return [];
  }

  const blocks: { start: number; end: number; duration: number }[] = [];
  let currentBlock = {
    start: roleAssignments[0].startMinutes,
    end: roleAssignments[0].endMinutes,
  };

  for (let i = 1; i < roleAssignments.length; i++) {
    const assignment = roleAssignments[i];
    if (assignment.startMinutes === currentBlock.end) {
      // Consecutive, extend block
      currentBlock.end = assignment.endMinutes;
    } else {
      // Gap, save current block and start new one
      blocks.push({
        start: currentBlock.start,
        end: currentBlock.end,
        duration: currentBlock.end - currentBlock.start,
      });
      currentBlock = {
        start: assignment.startMinutes,
        end: assignment.endMinutes,
      };
    }
  }

  // Don't forget the last block
  blocks.push({
    start: currentBlock.start,
    end: currentBlock.end,
    duration: currentBlock.end - currentBlock.start,
  });

  return blocks;
}

function calculateTimingSatisfaction(
  roleAssignments: AssignmentRecord[],
  crewShift: CrewShiftWindow,
  timingPref: number  // -1 = early, 0 = middle, +1 = late
): { satisfaction: number; details: string } {
  if (roleAssignments.length === 0) {
    return { satisfaction: 0.0, details: 'Role not assigned' };
  }

  const shiftStart = crewShift.shiftStartMin;
  const shiftEnd = crewShift.shiftEndMin;
  const shiftDuration = shiftEnd - shiftStart;
  
  if (shiftDuration <= 0) {
    return { satisfaction: 0.0, details: 'Invalid shift duration' };
  }

  // Calculate the center of all role assignments (weighted by duration)
  let totalMinutes = 0;
  let weightedCenter = 0;
  
  for (const a of roleAssignments) {
    const duration = a.endMinutes - a.startMinutes;
    const center = (a.startMinutes + a.endMinutes) / 2;
    weightedCenter += center * duration;
    totalMinutes += duration;
  }
  
  const roleCenter = weightedCenter / totalMinutes;
  
  // Normalize position to 0-1 within shift
  const normalizedPosition = (roleCenter - shiftStart) / shiftDuration;
  const clampedPosition = Math.max(0, Math.min(1, normalizedPosition));

  let satisfaction: number;
  let positionDesc: string;

  if (timingPref === -1) {
    // Prefer early: 1.0 at start (0.0), 0.0 at end (1.0)
    satisfaction = 1 - clampedPosition;
    positionDesc = 'early';
  } else if (timingPref === 1) {
    // Prefer late: 0.0 at start, 1.0 at end
    satisfaction = clampedPosition;
    positionDesc = 'late';
  } else {
    // Prefer middle (0): 1.0 at 0.5, 0.0 at 0.0 or 1.0
    const distanceFromMiddle = Math.abs(clampedPosition - 0.5);
    satisfaction = 1 - (distanceFromMiddle * 2);  // Scale: 0.5 distance = 0 satisfaction
    positionDesc = 'middle';
  }

  return { 
    satisfaction, 
    details: `Role center at ${(clampedPosition * 100).toFixed(1)}% of shift (prefers ${positionDesc}), satisfaction: ${(satisfaction * 100).toFixed(1)}%` 
  };
}

function calculateMaxCrewOnAtATime(
  roleId: number,
  allAssignments: AssignmentRecord[],
  maxCrew: number
): { satisfaction: number; details: string } {
  const roleAssignments = allAssignments.filter(a => a.roleId === roleId);
  
  if (roleAssignments.length === 0) {
    return { satisfaction: 1.0, details: 'No crew on this role' };
  }

  // Get all minute boundaries where assignments start or end
  const events: { minute: number; delta: number }[] = [];
  for (const a of roleAssignments) {
    events.push({ minute: a.startMinutes, delta: +1 });
    events.push({ minute: a.endMinutes, delta: -1 });
  }
  events.sort((a, b) => a.minute - b.minute || a.delta - b.delta);

  // Sweep through and find max concurrent
  let currentCrew = 0;
  let maxConcurrent = 0;
  
  for (const event of events) {
    currentCrew += event.delta;
    maxConcurrent = Math.max(maxConcurrent, currentCrew);
  }

  if (maxConcurrent <= maxCrew) {
    return { 
      satisfaction: 1.0, 
      details: `Max ${maxConcurrent} crew on role at once (limit: ${maxCrew})` 
    };
  }

  return { 
    satisfaction: 0.0, 
    details: `Max ${maxConcurrent} crew on role at once exceeded limit of ${maxCrew}` 
  };
}

function calculateDistribution(
  roleId: number,
  targetRoleId: number,
  crewAssignments: AssignmentRecord[],
  crewShift: CrewShiftWindow | undefined,
  distributionPref: number  // -1 = prefer more roleId, 0 = balanced, +1 = prefer more targetRoleId
): { satisfaction: number; details: string } {
  // Calculate total minutes for each role
  const roleMinutes = crewAssignments
    .filter(a => a.roleId === roleId)
    .reduce((sum, a) => sum + (a.endMinutes - a.startMinutes), 0);

  const targetRoleMinutes = crewAssignments
    .filter(a => a.roleId === targetRoleId)
    .reduce((sum, a) => sum + (a.endMinutes - a.startMinutes), 0);

  const totalMinutes = roleMinutes + targetRoleMinutes;

  if (totalMinutes === 0) {
    return { satisfaction: 1.0, details: 'Neither role assigned' };
  }

  let satisfaction: number;
  let details: string;

  if (distributionPref === -1) {
    // -1 = prefer more time on primary role (roleId)
    if (roleMinutes > targetRoleMinutes) {
      satisfaction = 1.0;
      details = `Role ${roleId} (${roleMinutes}min) > target ${targetRoleId} (${targetRoleMinutes}min)`;
    } else {
      satisfaction = 0.0;
      details = `Role ${roleId} (${roleMinutes}min) <= target ${targetRoleId} (${targetRoleMinutes}min)`;
    }
  } else if (distributionPref === 1) {
    // +1 = prefer more time on target role (targetRoleId)
    if (targetRoleMinutes > roleMinutes) {
      satisfaction = 1.0;
      details = `Target ${targetRoleId} (${targetRoleMinutes}min) > role ${roleId} (${roleMinutes}min)`;
    } else {
      satisfaction = 0.0;
      details = `Target ${targetRoleId} (${targetRoleMinutes}min) <= role ${roleId} (${roleMinutes}min)`;
    }
  } else {
    // Want balanced (0)
    // Calculate maximum possible balance given shift constraints
    // Perfect balance would be 50-50, but we allow for unavoidable imbalance
    
    // Shift total working time (excluding breaks which might be a role too)
    const shiftDuration = crewShift 
      ? crewShift.shiftEndMin - crewShift.shiftStartMin 
      : totalMinutes;
    
    // The best possible balance is when the difference is minimized
    // Given blockSize constraints, perfect 50-50 may not be possible
    // We consider "balanced" if the difference is <= 30 minutes (half an hour)
    const difference = Math.abs(roleMinutes - targetRoleMinutes);
    const balanceThreshold = 30;  // Allow 30 min imbalance as "balanced"
    
    if (difference <= balanceThreshold) {
      satisfaction = 1.0;
      details = `Balanced: ${roleMinutes}min vs ${targetRoleMinutes}min (diff: ${difference}min)`;
    } else {
      // Gradient: the closer to balanced, the higher the score
      const maxPossibleDiff = shiftDuration;
      satisfaction = Math.max(0, 1 - (difference - balanceThreshold) / (maxPossibleDiff - balanceThreshold));
      details = `Imbalanced: ${roleMinutes}min vs ${targetRoleMinutes}min (diff: ${difference}min, satisfaction: ${(satisfaction * 100).toFixed(1)}%)`;
    }
  }

  return { satisfaction, details };
}

// ============================================================================
// Aggregate Functions
// ============================================================================

export interface AggregatedPreferenceStats {
  totalPreferences: number;
  preferencesMet: number;
  averageSatisfaction: number;
  fairnessIndex: number;
  crewWithPreferences: number;
}

/**
 * Calculate aggregate preference statistics from satisfaction results
 */
export function calculateAggregateStats(results: SatisfactionResult[]): AggregatedPreferenceStats {
  if (results.length === 0) {
    return {
      totalPreferences: 0,
      preferencesMet: 0,
      averageSatisfaction: 0,
      fairnessIndex: 100,
      crewWithPreferences: 0,
    };
  }

  const totalPreferences = results.length;
  const preferencesMet = results.filter(r => r.met).length;
  const averageSatisfaction = results.reduce((sum, r) => sum + r.satisfaction, 0) / results.length;

  // Count unique crew with preferences
  const uniqueCrew = new Set(results.map(r => r.crewId));
  const crewWithPreferences = uniqueCrew.size;

  // Calculate fairness using Gini coefficient on per-crew satisfaction
  const satisfactionByCrew = new Map<string, number[]>();
  for (const r of results) {
    if (!satisfactionByCrew.has(r.crewId)) {
      satisfactionByCrew.set(r.crewId, []);
    }
    satisfactionByCrew.get(r.crewId)!.push(r.satisfaction);
  }

  const crewAverages: number[] = [];
  satisfactionByCrew.forEach((satisfactions) => {
    const avg = satisfactions.reduce((s, v) => s + v, 0) / satisfactions.length;
    crewAverages.push(avg);
  });

  const fairnessIndex = computeFairnessIndex(crewAverages);

  return {
    totalPreferences,
    preferencesMet,
    averageSatisfaction,
    fairnessIndex,
    crewWithPreferences,
  };
}

/**
 * Compute Gini-based fairness index in [0, 100]
 * 100 = perfectly fair, 0 = completely unfair
 */
function computeFairnessIndex(scores: number[]): number {
  const n = scores.length;
  if (n === 0) return 100;

  const sorted = [...scores].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum <= 0) return 100;

  // Gini via mean absolute difference
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

/**
 * Aggregate satisfaction results into stats for LogPreferenceMetadata
 * Only processes eligible results (where the rule was actually applicable)
 */
export function aggregateSatisfactionStats(
  results: SatisfactionResult[],
  crewRoleRules: CrewRoleRuleRecord[]
): AggregatedSatisfactionStats {
  if (results.length === 0) {
    return {
      eligiblePreferences: 0,
      preferencesMet: 0,
      percentMet: 0,
      avgSatisfaction: 0,
      eligibleCrew: 0,
      avgSatisfactionPerCrew: 0,
      fairnessIndex: 100,
      fairnessGrade: 'A+',
      breakdownByRoleRule: [],
      breakdownByCrew: [],
      breakdownByCrewAndRuleType: [],
    };
  }

  // Core metrics
  const eligiblePreferences = results.length;
  const preferencesMet = results.filter(r => r.met).length;
  const percentMet = (preferencesMet / eligiblePreferences) * 100;
  const avgSatisfaction = results.reduce((sum, r) => sum + r.satisfaction, 0) / eligiblePreferences * 100;

  // Per-crew satisfaction for fairness and avg per crew
  const satisfactionByCrew = new Map<string, number[]>();
  for (const r of results) {
    if (!satisfactionByCrew.has(r.crewId)) {
      satisfactionByCrew.set(r.crewId, []);
    }
    satisfactionByCrew.get(r.crewId)!.push(r.satisfaction);
  }

  const crewAverages: number[] = [];
  satisfactionByCrew.forEach((sats) => {
    const avg = sats.reduce((s, v) => s + v, 0) / sats.length;
    crewAverages.push(avg);
  });

  const eligibleCrew = satisfactionByCrew.size;
  const avgSatisfactionPerCrew = crewAverages.length > 0
    ? (crewAverages.reduce((s, v) => s + v, 0) / crewAverages.length) * 100
    : 0;

  const fairnessIndex = computeFairnessIndex(crewAverages);
  const fairnessGrade = getGrade(fairnessIndex);

  // Breakdown by RoleRule ID
  const byRoleRule = new Map<number, { met: number; total: number; satSum: number; type: RoleRuleType }>();
  for (const r of results) {
    const rule = crewRoleRules.find(crr => crr.id === r.crewRoleRuleId);
    const roleRuleId = rule?.roleRuleId ?? 0;
    
    if (!byRoleRule.has(roleRuleId)) {
      byRoleRule.set(roleRuleId, { met: 0, total: 0, satSum: 0, type: r.ruleType });
    }
    const stats = byRoleRule.get(roleRuleId)!;
    stats.total++;
    if (r.met) stats.met++;
    stats.satSum += r.satisfaction;
  }

  const breakdownByRoleRule: RoleRuleBreakdown[] = [];
  byRoleRule.forEach((stats, roleRuleId) => {
    breakdownByRoleRule.push({
      roleRuleId,
      ruleType: stats.type,
      eligible: stats.total,
      met: stats.met,
      avgSatisfaction: (stats.satSum / stats.total) * 100,
      percentMet: (stats.met / stats.total) * 100,
    });
  });

  // Breakdown by Crew ID
  const breakdownByCrew: CrewBreakdown[] = [];
  satisfactionByCrew.forEach((sats, crewId) => {
    const total = sats.length;
    const met = sats.filter(s => s >= 0.5).length;
    const avgSatisfaction = (sats.reduce((sum, s) => sum + s, 0) / total) * 100;
    const satisfactionPct = (met / total) * 100;

    breakdownByCrew.push({
      crewId,
      total,
      met,
      avgSatisfaction,
      satisfactionPct,
    });
  });

  // Breakdown by Crew ID AND RuleType (for crew preferences graphs)
  const byCrewAndRuleType = new Map<string, { total: number; met: number }>();
  for (const r of results) {
    const key = `${r.crewId}::${r.ruleType}`;
    if (!byCrewAndRuleType.has(key)) {
      byCrewAndRuleType.set(key, { total: 0, met: 0 });
    }
    const stats = byCrewAndRuleType.get(key)!;
    stats.total++;
    if (r.met) stats.met++;
  }

  const breakdownByCrewAndRuleType: CrewRuleTypeBreakdown[] = [];
  byCrewAndRuleType.forEach((stats, key) => {
    const [crewId, ruleType] = key.split('::');
    breakdownByCrewAndRuleType.push({
      crewId,
      ruleType: ruleType as RoleRuleType,
      total: stats.total,
      met: stats.met,
      percentMet: stats.total > 0 ? (stats.met / stats.total) * 100 : 0,
    });
  });

  return {
    eligiblePreferences,
    preferencesMet,
    percentMet,
    avgSatisfaction,
    eligibleCrew,
    avgSatisfactionPerCrew,
    fairnessIndex,
    fairnessGrade,
    breakdownByRoleRule,
    breakdownByCrew,
    breakdownByCrewAndRuleType,
  };
}

/**
 * Save aggregated satisfaction stats to LogPreferenceMetadata table
 */
export async function saveLogPreferenceMetadata(
  prisma: any,  // PrismaClient - using any to avoid import issues
  logbookId: string,
  stats: AggregatedSatisfactionStats
): Promise<void> {
  // Delete any existing metadata for this logbook
  await prisma.logPreferenceMetadata.deleteMany({
    where: { logbookId }
  });

  // Create new metadata
  await prisma.logPreferenceMetadata.create({
    data: {
      id: crypto.randomUUID(),
      logbookId,
      eligiblePreferences: stats.eligiblePreferences,
      preferencesMet: stats.preferencesMet,
      percentMet: stats.percentMet,
      avgSatisfaction: stats.avgSatisfaction,
      eligibleCrew: stats.eligibleCrew,
      avgSatisfactionPerCrew: stats.avgSatisfactionPerCrew,
      fairnessIndex: stats.fairnessIndex,
      fairnessGrade: stats.fairnessGrade,
      breakdownByRoleRule: stats.breakdownByRoleRule,
      breakdownByCrew: stats.breakdownByCrew,
      breakdownByCrewAndRuleType: stats.breakdownByCrewAndRuleType,
    }
  });
}
