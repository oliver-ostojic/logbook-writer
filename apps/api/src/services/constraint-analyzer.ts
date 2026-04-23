import type {
  ConstraintAnalysisSummary,
  ConstraintViolation,
  ConstraintViolationCategory,
  ConstraintViolationSeverity,
  PreferenceSatisfactionSummary,
} from '@logbook-writer/shared-types/src/constraint-analysis';
import type { PreferenceType } from '@logbook-writer/shared-types/src/solver';
import type {
  CrewDescriptor,
  PreferenceDescriptor,
  RoleDescriptor,
  SolverInputV2,
} from '../solver2/types';

export type AssignmentRecord = {
  crewId: string;
  roleId: number;
  startMinute: number;
  endMinute: number;
};

interface CrewRoleBlock {
  crewId: string;
  roleId: number;
  start: number;
  end: number;
  slots: number;
}

interface AnalyzerContext {
  solverInput: SolverInputV2;
  assignments: AssignmentRecord[];
  roleById: Map<number, RoleDescriptor>;
  crewMinutesByRole: Map<string, Map<number, number>>;
  crewAssignmentsByRole: Map<string, Map<number, AssignmentRecord[]>>;
  roleAssignments: Map<number, AssignmentRecord[]>;
}

/**
 * Analyze solver output generated via SolverInputV2 + CP-SAT assignments.
 */
export function analyzeSolverResult({
  solverInput,
  assignments,
}: {
  solverInput: SolverInputV2;
  assignments: AssignmentRecord[];
}): ConstraintAnalysisSummary {
  const roleById = new Map<number, RoleDescriptor>();
  solverInput.roles.forEach((role) => roleById.set(role.id, role));

  const crewAssignmentsByRole = new Map<string, Map<number, AssignmentRecord[]>>();
  const crewMinutesByRole = new Map<string, Map<number, number>>();
  const roleAssignments = new Map<number, AssignmentRecord[]>();

  const normalizedAssignments = assignments.slice().sort((a, b) => {
    if (a.crewId === b.crewId) {
      return a.startMinute - b.startMinute;
    }
    return a.crewId.localeCompare(b.crewId);
  });

  for (const assignment of normalizedAssignments) {
    if (!roleAssignments.has(assignment.roleId)) {
      roleAssignments.set(assignment.roleId, []);
    }
    roleAssignments.get(assignment.roleId)!.push(assignment);

    if (!crewAssignmentsByRole.has(assignment.crewId)) {
      crewAssignmentsByRole.set(assignment.crewId, new Map());
    }
    const crewRoles = crewAssignmentsByRole.get(assignment.crewId)!;
    if (!crewRoles.has(assignment.roleId)) {
      crewRoles.set(assignment.roleId, []);
    }
    crewRoles.get(assignment.roleId)!.push(assignment);

    if (!crewMinutesByRole.has(assignment.crewId)) {
      crewMinutesByRole.set(assignment.crewId, new Map());
    }
    const crewRoleMinutes = crewMinutesByRole.get(assignment.crewId)!;
    const minutes = assignment.endMinute - assignment.startMinute;
    crewRoleMinutes.set(
      assignment.roleId,
      (crewRoleMinutes.get(assignment.roleId) ?? 0) + minutes
    );
  }

  const context: AnalyzerContext = {
    solverInput,
    assignments: normalizedAssignments,
    roleById,
    crewMinutesByRole,
    crewAssignmentsByRole,
    roleAssignments,
  };

  const violations: ConstraintViolation[] = [];

  violations.push(
    ...checkAssignmentsAgainstStoreHours(context),
    ...checkCrewShiftBounds(context),
    ...checkCoverageWindows(context),
    ...checkCrewQuotas(context),
    ...checkRoleBlocks(context),
    ...checkConsecutivePolicies(context),
    ...checkRoleAccessGuards(context),
    ...checkCrewGaps(context)
  );

  let preferenceSummary: PreferenceSatisfactionSummary | undefined;
  const preferenceAnalysis = analyzePreferences(context);
  if (preferenceAnalysis) {
    preferenceSummary = preferenceAnalysis.summary;
    if (preferenceAnalysis.violations.length) {
      violations.push(...preferenceAnalysis.violations);
    }
  }

  const summaryLines = buildSummary(violations, preferenceSummary);

  return {
    violations,
    summaryLines,
    preferenceSummary,
  };
}

function checkAssignmentsAgainstStoreHours(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, assignments, roleById } = context;
  const store = solverInput.store;
  const crewById = new Map(solverInput.crew.map((crew) => [crew.id, crew] as const));
  const violations: ConstraintViolation[] = [];

  for (const assignment of assignments) {
    const role = roleById.get(assignment.roleId);
    const crew = crewById.get(assignment.crewId);

    if (!role || !crew) {
      violations.push({
        severity: 'error',
        category: 'consistency',
        message: `Assignment references unknown ${!role ? 'role' : 'crew'} (${!role ? assignment.roleId : assignment.crewId}).`,
        details: { assignment },
      });
      continue;
    }

    if (!role.allowOutsideStoreHours) {
      if (
        assignment.startMinute < store.openMinutesFromMidnight ||
        assignment.endMinute > store.closeMinutesFromMidnight
      ) {
        violations.push({
          severity: 'error',
          category: 'outside-hours',
          message: `${crew.name} is scheduled for ${role.displayName} outside store hours (${formatTimeRange(
            assignment.startMinute,
            assignment.endMinute
          )}).`,
          details: { crewId: crew.id, roleId: role.id },
        });
      }
    }

    if (
      assignment.startMinute < crew.shiftStartMin ||
      assignment.endMinute > crew.shiftEndMin
    ) {
      violations.push({
        severity: 'error',
        category: 'shift',
        message: `${crew.name} has ${role.displayName} work outside their shift (${formatTimeRange(
          assignment.startMinute,
          assignment.endMinute
        )}).`,
        details: { crewId: crew.id, roleId: role.id },
      });
    }
  }

  return violations;
}

function checkCrewShiftBounds(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, assignments, roleById } = context;
  const crewById = new Map(solverInput.crew.map((crew) => [crew.id, crew] as const));
  const violations: ConstraintViolation[] = [];

  for (const assignment of assignments) {
    const crew = crewById.get(assignment.crewId);
    const role = roleById.get(assignment.roleId);
    if (!crew || !role) continue;

    if (
      assignment.startMinute < crew.shiftStartMin ||
      assignment.endMinute > crew.shiftEndMin
    ) {
      violations.push({
        severity: 'error',
        category: 'shift',
        message: `${crew.name} has ${role.displayName} duties outside their shift window (${formatTimeRange(
          assignment.startMinute,
          assignment.endMinute
        )}).`,
        details: { crewId: crew.id, roleId: role.id },
      });
    }
  }

  return violations;
}

/**
 * Check coverage windows - ensure each window has required crew coverage.
 * CoverageWindowDescriptor: {roleId, startMin, endMin, crewPerMinute}
 * For each task-length-sized chunk within the window, check we have enough crew assigned.
 */
function checkCoverageWindows(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, roleAssignments, roleById } = context;
  const violations: ConstraintViolation[] = [];

  for (const window of solverInput.coverageWindows) {
    const role = roleById.get(window.roleId);
    if (!role) continue;

    const taskLength = role.taskLength;
    if (taskLength <= 0) continue;

    // Check each task-length-sized slot within the window
    for (let slotStart = window.startMin; slotStart < window.endMin; slotStart += taskLength) {
      const slotEnd = Math.min(slotStart + taskLength, window.endMin);
      
      // Count unique crew covering this slot
      const crewInSlot = new Set<string>();
      for (const assignment of roleAssignments.get(window.roleId) ?? []) {
        // Assignment overlaps slot if it starts before slot ends and ends after slot starts
        if (assignment.startMinute < slotEnd && assignment.endMinute > slotStart) {
          crewInSlot.add(assignment.crewId);
        }
      }

      if (crewInSlot.size < window.crewPerMinute) {
        violations.push({
          severity: 'error',
          category: 'coverage',
          message: `${role.displayName} coverage window (${formatTime(window.startMin)}–${formatTime(window.endMin)}) requires ${window.crewPerMinute} crew but only ${crewInSlot.size} at ${formatTime(slotStart)}.`,
          details: { 
            roleId: role.id, 
            windowStart: window.startMin,
            windowEnd: window.endMin,
            slotStart,
            required: window.crewPerMinute, 
            actual: crewInSlot.size 
          },
        });
        // Only report first violation per window to avoid spam
        break;
      }
    }
  }

  return violations;
}

/**
 * Check crew quotas - ensure crew got required minutes within time windows.
 * CrewQuotaDescriptor: {crewId, roleId, startMin, endMin, requiredMin}
 */
function checkCrewQuotas(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, crewAssignmentsByRole, roleById } = context;
  const crewById = new Map(solverInput.crew.map((crew) => [crew.id, crew] as const));
  const violations: ConstraintViolation[] = [];

  for (const quota of solverInput.crewQuotas) {
    const crew = crewById.get(quota.crewId);
    const role = roleById.get(quota.roleId);
    if (!crew || !role) continue;

    // Get assignments for this crew-role within the quota time window
    const assignments = crewAssignmentsByRole.get(crew.id)?.get(role.id) ?? [];
    
    // Sum minutes within the quota's time window
    let minutesInWindow = 0;
    for (const assignment of assignments) {
      // Calculate overlap between assignment and quota window
      const overlapStart = Math.max(assignment.startMinute, quota.startMin);
      const overlapEnd = Math.min(assignment.endMinute, quota.endMin);
      if (overlapEnd > overlapStart) {
        minutesInWindow += overlapEnd - overlapStart;
      }
    }

    if (minutesInWindow < quota.requiredMin) {
      violations.push({
        severity: 'error',
        category: 'quota',
        message: `${crew.name} needs ${quota.requiredMin / 60}h of ${role.displayName} (${formatTime(quota.startMin)}–${formatTime(quota.endMin)}) but only got ${(minutesInWindow / 60).toFixed(1)}h.`,
        details: { 
          crewId: crew.id, 
          roleId: role.id, 
          windowStart: quota.startMin,
          windowEnd: quota.endMin,
          requiredMinutes: quota.requiredMin, 
          actualMinutes: minutesInWindow 
        },
      });
    }
  }

  return violations;
}

/**
 * Check role blocks - validate task length alignment and window offsets.
 * NEW: Uses role.taskLength (minutes) instead of blockSize/minSlots/maxSlots.
 * Min/max constraints are now handled by crewQuotas.
 */
function checkRoleBlocks(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, crewAssignmentsByRole, roleById } = context;
  const crewById = new Map(solverInput.crew.map((crew) => [crew.id, crew] as const));
  const violations: ConstraintViolation[] = [];

  for (const [crewId, roleAssignments] of crewAssignmentsByRole.entries()) {
    const crew = crewById.get(crewId);
    if (!crew) continue;

    for (const [roleId, assignments] of roleAssignments.entries()) {
      const role = roleById.get(roleId);
      if (!role) continue;

      const taskLength = role.taskLength;
      const blocks = buildBlocks(assignments, taskLength, crewId, roleId);

      // Check task length alignment per contiguous block (only for taskLength > 0)
      for (const block of blocks) {
        const blockMinutes = block.end - block.start;
        
        // Check if block is aligned to taskLength
        if (taskLength > 0 && blockMinutes % taskLength !== 0) {
          violations.push({
            severity: 'warning',
            category: 'slot-block',
            message: `${role.displayName} tasks must be ${taskLength} minutes but ${crew.name} has a ${blockMinutes}-minute block.`,
            details: { crewId, roleId, block, taskLength },
          });
        }

        // Check window offsets constraint
        if (role.windowOffsets) {
          const crewShiftStart = crew.shiftStartMin;
          const windowStart = crewShiftStart + role.windowOffsets.startOffsetMin;
          const windowEnd = crewShiftStart + role.windowOffsets.endOffsetMin;
          if (block.start < windowStart || block.end > windowEnd) {
            violations.push({
              severity: 'warning',
              category: 'slot-block',
              message: `${role.displayName} for ${crew.name} must land between ${formatTime(windowStart)} and ${formatTime(windowEnd)}, but block spans ${formatTimeRange(block.start, block.end)}.`,
              details: { crewId, roleId, block, windowStart, windowEnd },
            });
          }
        }
      }
    }
  }

  return violations;
}

function checkConsecutivePolicies(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, crewAssignmentsByRole, roleById } = context;
  const crewById = new Map(solverInput.crew.map((crew) => [crew.id, crew] as const));
  const violations: ConstraintViolation[] = [];

  for (const role of solverInput.roles) {
    const crewRoleAssignments = new Map<string, AssignmentRecord[]>(
      solverInput.crew.map((crew) => [crew.id, crewAssignmentsByRole.get(crew.id)?.get(role.id) ?? []])
    );

    for (const [crewId, assignments] of crewRoleAssignments.entries()) {
      if (assignments.length === 0) continue;
      const crew = crewById.get(crewId);
      if (!crew) continue;

      // Use taskLength for block detection
      const blocks = buildBlocks(assignments, role.taskLength, crewId, role.id);
      if (role.consecutivePolicy === 'REQUIRED' && blocks.length > 1) {
        violations.push({
          severity: 'error',
          category: 'consecutive',
          message: `${role.displayName} must be consecutive but ${crew.name} has ${blocks.length} fragments.`,
          details: { crewId, roleId: role.id, fragments: blocks.length },
        });
      }
      if (role.consecutivePolicy === 'PREFERRED' && blocks.length > 1) {
        violations.push({
          severity: 'warning',
          category: 'consecutive',
          message: `${role.displayName} is preferred consecutive yet ${crew.name} has ${blocks.length} fragments.`,
          details: { crewId, roleId: role.id, fragments: blocks.length },
        });
      }
    }
  }

  return violations;
}

function checkRoleAccessGuards(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, crewAssignmentsByRole, roleById } = context;
  const crewById = new Map(solverInput.crew.map((crew) => [crew.id, crew] as const));
  const violations: ConstraintViolation[] = [];

  for (const [crewId, roleMap] of crewAssignmentsByRole.entries()) {
    const crew = crewById.get(crewId);
    if (!crew) continue;
    const shiftLength = crew.shiftEndMin - crew.shiftStartMin;

    for (const [roleId, assignments] of roleMap.entries()) {
      const role = roleById.get(roleId);
      if (!role) continue;

      if (
        role.minShiftLengthForRoleAccess &&
        shiftLength < role.minShiftLengthForRoleAccess &&
        assignments.length > 0
      ) {
        violations.push({
          severity: 'warning',
          category: 'shift',
          message: `${crew.name} worked ${role.displayName} but shift (${shiftLength}m) is below the ${role.minShiftLengthForRoleAccess}m minimum for that role.`,
          details: { crewId, roleId, shiftLength },
        });
      }
    }
  }

  return violations;
}

/**
 * Detect unassigned gaps in each crew member's shift.
 * A gap is any contiguous interval inside [shiftStartMin, shiftEndMin] with no role assigned.
 */
function checkCrewGaps(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, crewAssignmentsByRole } = context;
  const violations: ConstraintViolation[] = [];

  for (const crew of solverInput.crew) {
    const shiftStart = crew.shiftStartMin;
    const shiftEnd = crew.shiftEndMin;
    if (shiftEnd <= shiftStart) continue;

    const intervals: Array<{ start: number; end: number }> = [];
    const roleMap = crewAssignmentsByRole.get(crew.id);
    if (roleMap) {
      for (const assignments of roleMap.values()) {
        for (const a of assignments) {
          const start = Math.max(a.startMinute, shiftStart);
          const end = Math.min(a.endMinute, shiftEnd);
          if (end > start) intervals.push({ start, end });
        }
      }
    }

    intervals.sort((a, b) => a.start - b.start);

    const merged: Array<{ start: number; end: number }> = [];
    for (const iv of intervals) {
      const last = merged[merged.length - 1];
      if (last && iv.start <= last.end) {
        merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, iv.end) };
      } else {
        merged.push(iv);
      }
    }

    const gaps: Array<{ startMin: number; endMin: number }> = [];
    let cursor = shiftStart;
    for (const iv of merged) {
      if (iv.start > cursor) gaps.push({ startMin: cursor, endMin: iv.start });
      cursor = Math.max(cursor, iv.end);
    }
    if (cursor < shiftEnd) gaps.push({ startMin: cursor, endMin: shiftEnd });

    if (gaps.length > 0) {
      violations.push({
        severity: 'info',
        category: 'gap',
        message: `${crew.name} has ${gaps.length} unassigned gap${gaps.length !== 1 ? 's' : ''}.`,
        details: { crewId: crew.id, gapCount: gaps.length, gaps },
      });
    }
  }

  return violations;
}

/**
 * Build contiguous blocks from sorted assignments.
 * taskLength is used to calculate how many tasks fit in each block.
 */
function buildBlocks(
  assignments: AssignmentRecord[],
  taskLength: number,
  crewId: string,
  roleId: number
): CrewRoleBlock[] {
  const sorted = assignments.slice().sort((a, b) => a.startMinute - b.startMinute);
  const blocks: CrewRoleBlock[] = [];
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  for (const assignment of sorted) {
    if (currentStart === null || currentEnd === null) {
      currentStart = assignment.startMinute;
      currentEnd = assignment.endMinute;
      continue;
    }

    if (assignment.startMinute === currentEnd) {
      currentEnd = assignment.endMinute;
    } else {
      const duration = currentEnd - currentStart;
      blocks.push({
        crewId,
        roleId,
        start: currentStart,
        end: currentEnd,
        slots: taskLength > 0 ? Math.floor(duration / taskLength) : 1,
      });
      currentStart = assignment.startMinute;
      currentEnd = assignment.endMinute;
    }
  }

  if (currentStart !== null && currentEnd !== null) {
    const duration = currentEnd - currentStart;
    blocks.push({
      crewId,
      roleId,
      start: currentStart,
      end: currentEnd,
      slots: taskLength > 0 ? Math.floor(duration / taskLength) : 1,
    });
  }

  return blocks;
}

interface PreferenceAnalysisResult {
  summary: PreferenceSatisfactionSummary;
  violations: ConstraintViolation[];
}

function analyzePreferences(context: AnalyzerContext): PreferenceAnalysisResult | undefined {
  const preferences = context.solverInput.preferences ?? [];
  if (!preferences.length) {
    return undefined;
  }

  const crewAssignments = context.crewAssignmentsByRole;
  const roleById = context.roleById;
  const crewById = new Map(context.solverInput.crew.map((crew) => [crew.id, crew] as const));
  const store = context.solverInput.store;

  let totalPreferences = 0;
  let satisfied = 0;
  let weightedScore = 0;
  const violations: ConstraintViolation[] = [];

  for (const preference of preferences) {
    if (!preference.roleId) {
      continue;
    }

    const crew = crewById.get(preference.crewId);
    const role = roleById.get(preference.roleId);
    if (!crew || !role) {
      continue;
    }

    const assignments = crewAssignments.get(crew.id)?.get(role.id) ?? [];
    const blocks = buildBlocks(assignments, role.taskLength, crew.id, role.id);

    const weight =
      preference.baseWeight *
      preference.crewWeight *
      preference.adaptiveBoost *
      (preference.bankedWeightBoost ?? 1);

    totalPreferences += 1;
    const isSatisfied = evaluatePreference(preference, crew, role, assignments, blocks);

    if (isSatisfied) {
      satisfied += 1;
      weightedScore += weight;
    } else {
      violations.push({
        severity: 'info',
        category: 'preference',
        message: `${crew.name}'s ${formatPreferenceName(preference.preferenceType)} preference for ${role.displayName} wasn't satisfied.`,
        details: { crewId: crew.id, roleId: role.id, preferenceType: preference.preferenceType },
      });
    }
  }

  if (totalPreferences === 0) {
    return undefined;
  }

  return {
    summary: {
      totalPreferences,
      satisfiedPreferences: satisfied,
      weightedScore,
    },
    violations,
  };
}

function evaluatePreference(
  preference: PreferenceDescriptor,
  crew: CrewDescriptor,
  role: RoleDescriptor,
  assignments: AssignmentRecord[],
  blocks: CrewRoleBlock[]
): boolean {
  if (!assignments.length) {
    return false;
  }

  switch (preference.preferenceType as PreferenceType) {
    case 'FAVORITE':
      return assignments.length > 0;
    case 'FIRST_HOUR': {
      const earliestAssignment = assignments.slice().sort((a, b) => a.startMinute - b.startMinute)[0];
      return earliestAssignment?.roleId === role.id && earliestAssignment.startMinute <= crew.shiftStartMin + 60;
    }
    case 'CONSECUTIVE':
      return blocks.length <= 1;
    case 'TIMING': {
      const intValue = preference.intValue ?? 0;
      const earliestBlock = blocks[0];
      if (!earliestBlock) return false;
      const offset = earliestBlock.start - crew.shiftStartMin;
      if (intValue <= 0) {
        return offset <= 60; // prefers early
      }
      return offset >= 180; // prefers later
    }
    default:
      return false;
  }
}

function buildSummary(
  violations: ConstraintViolation[],
  preferenceSummary?: PreferenceSatisfactionSummary
): string[] {
  const totalErrors = violations.filter((v) => v.severity === 'error').length;
  const totalWarnings = violations.filter((v) => v.severity === 'warning').length;
  const totalInfo = violations.filter((v) => v.severity === 'info').length;

  const lines: string[] = [];
  lines.push('Constraint analysis summary');
  if (totalErrors === 0 && totalWarnings === 0) {
    lines.push('✓ All hard constraints satisfied');
  } else {
    if (totalErrors > 0) {
      lines.push(`✗ ${totalErrors} error${totalErrors === 1 ? '' : 's'} detected`);
    }
    if (totalWarnings > 0) {
      lines.push(`• ${totalWarnings} warning${totalWarnings === 1 ? '' : 's'} detected`);
    }
  }

  if (totalInfo > 0) {
    lines.push(`ℹ️ ${totalInfo} informational note${totalInfo === 1 ? '' : 's'}`);
  }

  if (preferenceSummary) {
    const percent = preferenceSummary.totalPreferences
      ? ((preferenceSummary.satisfiedPreferences / preferenceSummary.totalPreferences) * 100).toFixed(1)
      : '0.0';
    lines.push(`Preferences satisfied: ${preferenceSummary.satisfiedPreferences}/${preferenceSummary.totalPreferences} (${percent}%)`);
  }

  return lines;
}

function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${suffix}`;
}

function formatTimeRange(start: number, end: number): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = ((hour + 11) % 12) + 1;
  return `${displayHour}:00 ${suffix}`;
}

function formatPreferenceName(type: PreferenceType): string {
  switch (type) {
    case 'FAVORITE':
      return 'favorite role';
    case 'FIRST_HOUR':
      return 'first-hour';
    case 'CONSECUTIVE':
      return 'consecutive';
    case 'TIMING':
      return 'timing';
    default:
      return type.toLowerCase();
  }
}
