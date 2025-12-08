// Builds constraints enforcing role-level consecutivePolicy requirements.
import type { RoleDescriptor, CrewDescriptor } from './types';
import type { RoleSlotVariable } from './role-slot-variables';
import type { ConsecutiveConstraintKind } from './milp-model';

export interface ConsecutiveConstraintCoefficient {
  variable: RoleSlotVariable;
  coefficient: number;
}

export interface ConsecutivePolicyConstraint {
  crewId: string;
  roleId: number;
  kind: ConsecutiveConstraintKind;
  slotIndexes: number[];
  coefficients: ConsecutiveConstraintCoefficient[];
  rhs: number;
}

export interface BuildConsecutivePolicyConstraintParams {
  crew: CrewDescriptor[];
  roles: RoleDescriptor[];
  roleSlotVariables: RoleSlotVariable[];
}

interface CrewRoleVariables {
  crewId: string;
  roleId: number;
  sortedVariables: RoleSlotVariable[];
  slotMap: Map<number, RoleSlotVariable>;
}

function groupVariables(roleSlotVariables: RoleSlotVariable[]): CrewRoleVariables[] {
  const map = new Map<string, CrewRoleVariables>();

  for (const variable of roleSlotVariables) {
    const key = `${variable.crewId}:${variable.roleId}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        crewId: variable.crewId,
        roleId: variable.roleId,
        sortedVariables: [],
        slotMap: new Map<number, RoleSlotVariable>(),
      } satisfies CrewRoleVariables;
      map.set(key, entry);
    }
    entry.sortedVariables.push(variable);
    entry.slotMap.set(variable.slotIndex, variable);
  }

  return [...map.values()].map((entry) => ({
    ...entry,
    sortedVariables: entry.sortedVariables.sort((a, b) => a.slotIndex - b.slotIndex),
  }));
}

export function buildConsecutivePolicyConstraints({
  crew,
  roles,
  roleSlotVariables,
}: BuildConsecutivePolicyConstraintParams): ConsecutivePolicyConstraint[] {
  const roleMap = new Map<number, RoleDescriptor>();
  for (const role of roles) {
    roleMap.set(role.id, role);
  }

  const groupedVariables = groupVariables(roleSlotVariables);
  const constraints: ConsecutivePolicyConstraint[] = [];

  for (const group of groupedVariables) {
    const role = roleMap.get(group.roleId);
    if (!role || role.consecutivePolicy !== 'REQUIRED') {
      continue;
    }

    const variables = group.sortedVariables;
    if (variables.length <= 1) {
      continue;
    }

    for (let i = 0; i < variables.length - 1; i++) {
      for (let k = i + 1; k < variables.length; k++) {
        const start = variables[i];
        const end = variables[k];
        if (start.slotIndex + 1 === end.slotIndex) {
          continue; // Adjacent slots already contiguous
        }

        let hasMissingSlots = false;
        for (let slot = start.slotIndex + 1; slot < end.slotIndex; slot++) {
          const intermediate = group.slotMap.get(slot);
          if (intermediate) {
            constraints.push({
              crewId: group.crewId,
              roleId: group.roleId,
              kind: 'REQUIRED_BRIDGE',
              slotIndexes: [start.slotIndex, slot, end.slotIndex],
              rhs: 1,
              coefficients: [
                { variable: start, coefficient: 1 },
                { variable: end, coefficient: 1 },
                { variable: intermediate, coefficient: -1 },
              ],
            });
          } else {
            hasMissingSlots = true;
          }
        }

        if (hasMissingSlots) {
          constraints.push({
            crewId: group.crewId,
            roleId: group.roleId,
            kind: 'REQUIRED_GAP',
            slotIndexes: [start.slotIndex, end.slotIndex],
            rhs: 1,
            coefficients: [
              { variable: start, coefficient: 1 },
              { variable: end, coefficient: 1 },
            ],
          });
        }
      }
    }
  }

  return constraints;
}
