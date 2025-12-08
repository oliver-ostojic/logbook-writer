// Emits equality constraints that force role assignments to "snap" to the role's
// blockSize by ensuring every slot inside a block shares the same boolean value.
import type { CrewDescriptor, RoleDescriptor } from './types';
import type { TimeGrid } from './time-grid';
import type { RoleSlotVariable } from './role-slot-variables';
import { buildCrewShiftSlotMap } from './crew-shifts';

export interface BlockSizeConstraintCoefficient {
  variable: RoleSlotVariable;
  coefficient: number;
}

export interface BlockSizeConstraint {
  roleId: number;
  crewId: string;
  blockSize: number;
  blockStartSlot: number;
  slotPair: [number, number];
  slotIndexes: number[];
  coefficients: BlockSizeConstraintCoefficient[];
  rhs: number;
}

export interface BuildBlockSizeConstraintParams {
  crew: CrewDescriptor[];
  roles: RoleDescriptor[];
  grid: TimeGrid;
  roleSlotVariables: RoleSlotVariable[];
}

interface CrewRoleSlotGroup {
  roleId: number;
  crewId: string;
  slotMap: Map<number, RoleSlotVariable>;
}

function groupVariables(roleSlotVariables: RoleSlotVariable[]): CrewRoleSlotGroup[] {
  const map = new Map<string, CrewRoleSlotGroup>();

  for (const variable of roleSlotVariables) {
    const key = `${variable.crewId}:${variable.roleId}`;
    let group = map.get(key);
    if (!group) {
      group = { roleId: variable.roleId, crewId: variable.crewId, slotMap: new Map() };
      map.set(key, group);
    }
    group.slotMap.set(variable.slotIndex, variable);
  }

  return [...map.values()].sort((a, b) => {
    if (a.roleId !== b.roleId) {
      return a.roleId - b.roleId;
    }
    return a.crewId.localeCompare(b.crewId);
  });
}

function collectBlockVariables(
  group: CrewRoleSlotGroup,
  blockStartSlot: number,
  blockSize: number
): RoleSlotVariable[] | null {
  const variables: RoleSlotVariable[] = [];
  for (let offset = 0; offset < blockSize; offset++) {
    const slotIndex = blockStartSlot + offset;
    const variable = group.slotMap.get(slotIndex);
    if (!variable) {
      return null;
    }
    variables.push(variable);
  }
  return variables;
}

export function buildBlockSizeConstraints({
  crew,
  roles,
  grid,
  roleSlotVariables,
}: BuildBlockSizeConstraintParams): BlockSizeConstraint[] {
  const crewShiftMap = buildCrewShiftSlotMap(crew, grid);
  const roleMap = new Map<number, RoleDescriptor>();
  for (const role of roles) {
    roleMap.set(role.id, role);
  }

  const groups = groupVariables(roleSlotVariables);
  const constraints: BlockSizeConstraint[] = [];

  for (const group of groups) {
    const role = roleMap.get(group.roleId);
    if (!role) {
      throw new Error(`Role ${group.roleId} missing from descriptors`);
    }

    const blockSize = Math.max(1, role.blockSize ?? 1);
    if (blockSize <= 1) {
      continue;
    }

    const shift = crewShiftMap.get(group.crewId);
    if (!shift) {
      throw new Error(`Missing shift metadata for crew ${group.crewId}`);
    }

    for (
      let blockStart = shift.startSlot;
      blockStart + blockSize <= shift.endSlot;
      blockStart += blockSize
    ) {
      const blockVariables = collectBlockVariables(group, blockStart, blockSize);
      if (!blockVariables) {
        continue;
      }

      const slotIndexes = blockVariables.map((variable) => variable.slotIndex);

      for (let i = 1; i < blockVariables.length; i++) {
        const prev = blockVariables[i - 1];
        const current = blockVariables[i];

        constraints.push({
          roleId: group.roleId,
          crewId: group.crewId,
          blockSize,
          blockStartSlot: blockStart,
          slotPair: [prev.slotIndex, current.slotIndex],
          slotIndexes,
          rhs: 0,
          coefficients: [
            { variable: prev, coefficient: 1 },
            { variable: current, coefficient: -1 },
          ],
        });
      }
    }
  }

  return constraints;
}
