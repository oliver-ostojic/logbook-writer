// Builds per-slot decision variable scaffolding (crew x role x slot) using the
// previously defined eligibility helpers. These records will later translate
// directly into CP-SAT boolean variables.
import type { AssignmentModelValue, CrewDescriptor, RoleDescriptor } from './types';
import type { TimeGrid } from './time-grid';
import { buildCrewRoleSlotWindow, enumerateEligibleSlots } from './slot-eligibility';

export interface RoleSlotVariable {
  crewId: string;
  roleId: number;
  slotIndex: number;
  assignmentModel: AssignmentModelValue;
}

// Generate role-slot variables for every eligible (crew, role) pairing. Any
// pairing that fails eligibility checks (store hours, offsets, min shift) is
// skipped so downstream constraint builders only see feasible variables.
export function buildRoleSlotVariables(
  crew: CrewDescriptor[],
  roles: RoleDescriptor[],
  grid: TimeGrid
): RoleSlotVariable[] {
  const roleMap = new Map<number, RoleDescriptor>();
  for (const role of roles) {
    roleMap.set(role.id, role);
  }

  const variables: RoleSlotVariable[] = [];

  for (const crewMember of crew) {
    for (const roleId of crewMember.roleIds) {
      const role = roleMap.get(roleId);
      if (!role) {
        throw new Error(`Role ${roleId} referenced by crew ${crewMember.id} not found`);
      }

      const assignmentModel: AssignmentModelValue = role.assignmentModel;

      const window = buildCrewRoleSlotWindow(crewMember, role, grid);
      if (!window) {
        continue;
      }

      const slots = enumerateEligibleSlots(window);
      for (const slot of slots) {
        variables.push({
          crewId: crewMember.id,
          roleId: role.id,
          slotIndex: slot,
          assignmentModel,
        });
      }
    }
  }

  return variables;
}
