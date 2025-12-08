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
    ...checkHourlyRequirements(context),
    ...checkWindowRequirements(context),
    ...checkDailyRequirements(context),
    ...checkRoleBlocks(context),
    ...checkConsecutivePolicies(context),
    ...checkRoleAccessGuards(context)
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

function checkHourlyRequirements(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, roleAssignments, roleById } = context;
  const violations: ConstraintViolation[] = [];

  for (const requirement of solverInput.hourlyRequirements) {
    const role = roleById.get(requirement.roleId);
    if (!role) continue;

    const startMin = requirement.hour * 60;
    const endMin = startMin + 60;
    const set = new Set<string>();
    for (const assignment of roleAssignments.get(requirement.roleId) ?? []) {
      if (assignment.startMinute < endMin && assignment.endMinute > startMin) {
        set.add(assignment.crewId);
      }
    }

    if (set.size < requirement.required) {
      violations.push({
        severity: 'error',
        category: 'hourly',
        message: `${role.displayName} at ${formatHour(requirement.hour)} requires ${requirement.required} crew but only ${set.size} were scheduled.`,
        details: { roleId: role.id, hour: requirement.hour, required: requirement.required, actual: set.size },
      });
    }
  }

  return violations;
}

function checkWindowRequirements(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, roleAssignments, roleById } = context;
  const violations: ConstraintViolation[] = [];

  for (const window of solverInput.windowRequirements) {
    const role = roleById.get(window.roleId);
    if (!role) continue;

    let windowCompliant = true;
    for (let hour = window.startHour; hour < window.endHour; hour++) {
      const startMin = hour * 60;
      const endMin = startMin + 60;
      const set = new Set<string>();
      for (const assignment of roleAssignments.get(window.roleId) ?? []) {
        if (assignment.startMinute < endMin && assignment.endMinute > startMin) {
          set.add(assignment.crewId);
        }
      }
      if (set.size < window.requiredPerHour) {
        windowCompliant = false;
        violations.push({
          severity: 'error',
          category: 'window',
          message: `${role.displayName} window ${formatHour(window.startHour)}–${formatHour(window.endHour)} needs ${window.requiredPerHour} per hour but fell short at ${formatHour(hour)}.`,
          details: { roleId: role.id, hour, required: window.requiredPerHour, actual: set.size },
        });
        break;
      }
    }

    if (windowCompliant === false) {
      continue;
    }
  }

  return violations;
}

function checkDailyRequirements(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, crewMinutesByRole, roleById } = context;
  const crewById = new Map(solverInput.crew.map((crew) => [crew.id, crew] as const));
  const violations: ConstraintViolation[] = [];

  for (const requirement of solverInput.dailyRequirements) {
    const crew = crewById.get(requirement.crewId);
    const role = roleById.get(requirement.roleId);
    if (!crew || !role) continue;

    const actualMinutes = crewMinutesByRole.get(crew.id)?.get(role.id) ?? 0;

    if (actualMinutes < requirement.requiredMinutes) {
      violations.push({
        severity: 'error',
        category: 'daily',
        message: `${crew.name} needs ${requirement.requiredMinutes / 60}h on ${role.displayName} but only received ${(actualMinutes / 60).toFixed(1)}h.`,
        details: { crewId: crew.id, roleId: role.id, requiredMinutes: requirement.requiredMinutes, actualMinutes },
      });
    }
  }

  return violations;
}

function checkRoleBlocks(context: AnalyzerContext): ConstraintViolation[] {
  const { solverInput, crewAssignmentsByRole, roleById } = context;
  const store = solverInput.store;
  const crewById = new Map(solverInput.crew.map((crew) => [crew.id, crew] as const));
  const violations: ConstraintViolation[] = [];

  for (const [crewId, roleAssignments] of crewAssignmentsByRole.entries()) {
    const crew = crewById.get(crewId);
    if (!crew) continue;

    for (const [roleId, assignments] of roleAssignments.entries()) {
      const role = roleById.get(roleId);
      if (!role) continue;

      const blocks = buildBlocks(assignments, store.baseSlotMinutes, crewId, roleId);
      const blockSize = role.blockSize ?? 1;

      // Calculate total blocks for min/max check (across all contiguous blocks)
      const totalSlots = blocks.reduce((sum, b) => sum + b.slots, 0);
      const totalBlocks = Math.floor(totalSlots / blockSize);

      // Check min/max on TOTAL blocks for this crew-role, not per contiguous block
      if (role.minSlots && totalBlocks < role.minSlots) {
        violations.push({
          severity: 'warning',
          category: 'slot-block',
          message: `${crew.name}'s total ${role.displayName} is ${totalBlocks} blocks but needs at least ${role.minSlots}.`,
          details: { crewId, roleId, totalBlocks, minRequired: role.minSlots },
        });
      }
      if (role.maxSlots && totalBlocks > role.maxSlots) {
        violations.push({
          severity: 'warning',
          category: 'slot-block',
          message: `${crew.name}'s total ${role.displayName} is ${totalBlocks} blocks but max is ${role.maxSlots}.`,
          details: { crewId, roleId, totalBlocks, maxAllowed: role.maxSlots },
        });
      }

      // Check block alignment per contiguous block (only for blockSize > 1)
      for (const block of blocks) {
        if (blockSize > 1 && block.slots % blockSize !== 0) {
          violations.push({
            severity: 'warning',
            category: 'slot-block',
            message: `${role.displayName} blocks must align to ${blockSize} slots but ${crew.name} has a ${block.slots}-slot block.`,
            details: { crewId, roleId, block, requiredBlockSize: blockSize },
          });
        }

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
  const store = solverInput.store;
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

      const blocks = buildBlocks(assignments, store.baseSlotMinutes, crewId, role.id);
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

function buildBlocks(
  assignments: AssignmentRecord[],
  baseSlotMinutes: number,
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
      blocks.push({
        crewId,
        roleId,
        start: currentStart,
        end: currentEnd,
        slots: (currentEnd - currentStart) / baseSlotMinutes,
      });
      currentStart = assignment.startMinute;
      currentEnd = assignment.endMinute;
    }
  }

  if (currentStart !== null && currentEnd !== null) {
    blocks.push({
      crewId,
      roleId,
      start: currentStart,
      end: currentEnd,
      slots: (currentEnd - currentStart) / baseSlotMinutes,
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
    const blocks = buildBlocks(assignments, store.baseSlotMinutes, crew.id, role.id);

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
