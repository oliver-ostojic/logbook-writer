// Translates normalized coverage requirements (hourly + window) into constraint
// descriptors tied to the previously generated role-slot variables.
import type { HourlyRequirementWindow } from './hourly-coverage';
import type { WindowRequirementRange } from './window-coverage';
import type { RoleSlotVariable } from './role-slot-variables';
import type { RoleDescriptor } from './types';
import { roleSupportsAssignmentModel } from './assignment-models';

export type CoverageConstraintType = 'HOURLY' | 'WINDOW';

export interface CoverageConstraint {
  type: CoverageConstraintType;
  roleId: number;
  slotIndexes: number[];
  requiredSlotCount: number;
  variables: RoleSlotVariable[];
  metadata:
    | { hour: number }
    | { startHour: number; endHour: number };
}

// Build a two-level map roleId -> slotIndex -> RoleSlotVariable[] for fast lookups
// while assembling the coverage constraints.
function indexVariables(
  variables: RoleSlotVariable[]
): Map<number, Map<number, RoleSlotVariable[]>> {
  const roleMap = new Map<number, Map<number, RoleSlotVariable[]>>();
  for (const variable of variables) {
    let slotMap = roleMap.get(variable.roleId);
    if (!slotMap) {
      slotMap = new Map<number, RoleSlotVariable[]>();
      roleMap.set(variable.roleId, slotMap);
    }
    let list = slotMap.get(variable.slotIndex);
    if (!list) {
      list = [];
      slotMap.set(variable.slotIndex, list);
    }
    list.push(variable);
  }
  return roleMap;
}

function collectVariablesForSlots(
  roleSlotMap: Map<number, RoleSlotVariable[]>,
  slotIndexes: number[]
): RoleSlotVariable[] {
  const collected: RoleSlotVariable[] = [];
  for (const slotIndex of slotIndexes) {
    const slotVars = roleSlotMap.get(slotIndex);
    if (slotVars?.length) {
      collected.push(...slotVars);
    }
  }
  return collected;
}

export interface BuildCoverageConstraintParams {
  roles: RoleDescriptor[];
  hourlyWindows: HourlyRequirementWindow[];
  windowRanges: WindowRequirementRange[];
  roleSlotVariables: RoleSlotVariable[];
}

// Main entrypoint: for every normalized requirement range, gather the relevant
// role-slot variables and emit a constraint descriptor that future CP-SAT code can
// convert into equality constraints.
export function buildCoverageConstraints({
  roles,
  hourlyWindows,
  windowRanges,
  roleSlotVariables,
}: BuildCoverageConstraintParams): CoverageConstraint[] {
  const indexedVariables = indexVariables(roleSlotVariables);
  const roleLookup = new Map<number, RoleDescriptor>();
  for (const role of roles) {
    roleLookup.set(role.id, role);
  }
  const constraints: CoverageConstraint[] = [];

  for (const window of hourlyWindows) {
    const role = roleLookup.get(window.roleId);
    if (!roleSupportsAssignmentModel(role, 'HOURLY')) {
      continue;
    }
    const slotMap = indexedVariables.get(window.roleId) ?? new Map();
    const variables = collectVariablesForSlots(slotMap, window.slotIndexes);

    constraints.push({
      type: 'HOURLY',
      roleId: window.roleId,
      slotIndexes: window.slotIndexes,
      requiredSlotCount: window.requiredSlotCount,
      variables,
      metadata: { hour: window.hour },
    });
  }

  for (const range of windowRanges) {
    const role = roleLookup.get(range.roleId);
    if (!roleSupportsAssignmentModel(role, 'HOURLY_WINDOW')) {
      continue;
    }
    const slotMap = indexedVariables.get(range.roleId) ?? new Map();
    const variables = collectVariablesForSlots(slotMap, range.slotIndexes);

    constraints.push({
      type: 'WINDOW',
      roleId: range.roleId,
      slotIndexes: range.slotIndexes,
      requiredSlotCount: range.totalRequiredSlots,
      variables,
      metadata: { startHour: range.startHour, endHour: range.endHour },
    });
  }

  return constraints;
}
