// Builds per-crew role usage constraint descriptors so the solver can enforce
// min/max slot bounds encoded on each Role record.
import type { RoleDescriptor } from './types';
import type { RoleSlotVariable } from './role-slot-variables';

export type RoleMinMaxConstraintType = 'MIN' | 'MAX';

export interface RoleMinMaxConstraint {
  type: RoleMinMaxConstraintType;
  roleId: number;
  crewId: string;
  requestedSlots: number;
  availableSlotCount: number;
  rhs: number;
  coefficients: RoleMinMaxCoefficient[];
  isSatisfiableGivenVariables: boolean;
}

export interface RoleMinMaxCoefficient {
  variable: RoleSlotVariable;
  coefficient: number;
}

export interface BuildRoleMinMaxConstraintParams {
  roles: RoleDescriptor[];
  roleSlotVariables: RoleSlotVariable[];
}

interface RoleCrewVariableGroup {
  roleId: number;
  crewId: string;
  variables: RoleSlotVariable[];
}

function groupRoleSlotVariables(roleSlotVariables: RoleSlotVariable[]): RoleCrewVariableGroup[] {
  const map = new Map<string, RoleCrewVariableGroup>();

  for (const variable of roleSlotVariables) {
    const key = `${variable.roleId}:${variable.crewId}`;
    let group = map.get(key);
    if (!group) {
      group = { roleId: variable.roleId, crewId: variable.crewId, variables: [] };
      map.set(key, group);
    }
    group.variables.push(variable);
  }

  return [...map.values()].sort((a, b) => {
    if (a.roleId !== b.roleId) {
      return a.roleId - b.roleId;
    }
    return a.crewId.localeCompare(b.crewId);
  });
}

function sortVariablesForDeterminism(variables: RoleSlotVariable[]): RoleSlotVariable[] {
  return [...variables].sort((a, b) => {
    if (a.slotIndex !== b.slotIndex) {
      return a.slotIndex - b.slotIndex;
    }
    if (a.crewId !== b.crewId) {
      return a.crewId.localeCompare(b.crewId);
    }
    return a.roleId - b.roleId;
  });
}

function buildConstraint(
  group: RoleCrewVariableGroup,
  requested: number,
  type: RoleMinMaxConstraintType
): RoleMinMaxConstraint | null {
  if (requested <= 0) {
    return null;
  }

  const orderedVariables = sortVariablesForDeterminism(group.variables);
  if (!orderedVariables.length) {
    return null;
  }

  const coefficients: RoleMinMaxCoefficient[] = orderedVariables.map((variable) => ({
    variable,
    coefficient: 1,
  }));

  const availableSlotCount = orderedVariables.length;
  const rhs = Math.min(requested, availableSlotCount);

  return {
    type,
    roleId: group.roleId,
    crewId: group.crewId,
    requestedSlots: requested,
    availableSlotCount,
    rhs,
    coefficients,
    isSatisfiableGivenVariables: availableSlotCount >= requested,
  } satisfies RoleMinMaxConstraint;
}

export function buildRoleMinMaxConstraints({
  roles,
  roleSlotVariables,
}: BuildRoleMinMaxConstraintParams): RoleMinMaxConstraint[] {
  const roleMap = new Map<number, RoleDescriptor>();
  for (const role of roles) {
    roleMap.set(role.id, role);
  }

  const constraints: RoleMinMaxConstraint[] = [];
  const groups = groupRoleSlotVariables(roleSlotVariables);

  for (const group of groups) {
    const role = roleMap.get(group.roleId);
    if (!role) {
      throw new Error(`Role ${group.roleId} missing from descriptor list`);
    }

    const minConstraint = buildConstraint(group, role.minSlots ?? 0, 'MIN');
    if (minConstraint) {
      constraints.push(minConstraint);
    }

    const maxConstraint = buildConstraint(group, role.maxSlots ?? 0, 'MAX');
    if (maxConstraint) {
      constraints.push(maxConstraint);
    }
  }

  return constraints;
}
