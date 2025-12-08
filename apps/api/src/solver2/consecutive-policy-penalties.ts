// Builds soft-penalty descriptors for roles whose consecutive policy allows gaps
// so the objective can discourage (or later reward) slot breaks between blocks.
import type { PreferenceType } from '@logbook-writer/shared-types';
import type { RoleDescriptor } from './types';
import type { RoleSlotVariable } from './role-slot-variables';

export type ConsecutivePenaltySource =
  | 'ROLE_POLICY'
  | 'PREFERENCE_CONTIGUOUS'
  | 'PREFERENCE_SWITCH';

export interface ConsecutiveGapPenalty {
  crewId: string;
  roleId: number;
  slotPair: [number, number];
  weight: number;
  variables: [RoleSlotVariable, RoleSlotVariable];
  source?: ConsecutivePenaltySource;
  rolePreferenceId?: number;
  preferenceType?: PreferenceType;
}

export interface BuildConsecutivePolicyPenaltyParams {
  roles: RoleDescriptor[];
  roleSlotVariables: RoleSlotVariable[];
}

interface CrewRoleVariableGroup {
  crewId: string;
  roleId: number;
  sortedVariables: RoleSlotVariable[];
}

const BASE_CONSECUTIVE_GAP_WEIGHT = 500;

function groupVariables(roleSlotVariables: RoleSlotVariable[]): CrewRoleVariableGroup[] {
  const map = new Map<string, CrewRoleVariableGroup>();

  for (const variable of roleSlotVariables) {
    const key = `${variable.crewId}:${variable.roleId}`;
    let group = map.get(key);
    if (!group) {
      group = {
        crewId: variable.crewId,
        roleId: variable.roleId,
        sortedVariables: [],
      } satisfies CrewRoleVariableGroup;
      map.set(key, group);
    }
    group.sortedVariables.push(variable);
  }

  return [...map.values()].map((group) => ({
    ...group,
    sortedVariables: group.sortedVariables.sort((a, b) => a.slotIndex - b.slotIndex),
  }));
}

function resolveWeight(role: RoleDescriptor): number | null {
  if (role.consecutivePolicy !== 'PREFERRED') {
    return null;
  }

  return BASE_CONSECUTIVE_GAP_WEIGHT;
}

export function buildConsecutivePolicyGapPenalties({
  roles,
  roleSlotVariables,
}: BuildConsecutivePolicyPenaltyParams): ConsecutiveGapPenalty[] {
  if (!roles.length || !roleSlotVariables.length) {
    return [];
  }

  const roleMap = new Map<number, RoleDescriptor>();
  for (const role of roles) {
    roleMap.set(role.id, role);
  }

  const groupedVariables = groupVariables(roleSlotVariables);
  const penalties: ConsecutiveGapPenalty[] = [];

  for (const group of groupedVariables) {
    const role = roleMap.get(group.roleId);
    if (!role) {
      continue;
    }

    const weight = resolveWeight(role);
    if (!weight) {
      continue;
    }

    const variables = group.sortedVariables;
    if (variables.length <= 1) {
      continue;
    }

    for (let index = 0; index < variables.length - 1; index++) {
      const current = variables[index];
      const next = variables[index + 1];
      if (next.slotIndex - current.slotIndex !== 1) {
        continue;
      }

      penalties.push({
        crewId: group.crewId,
        roleId: group.roleId,
        slotPair: [current.slotIndex, next.slotIndex],
        weight,
        variables: [current, next],
        source: 'ROLE_POLICY',
      });
    }
  }

  return penalties;
}
