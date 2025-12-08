// Generates one-task-per-slot equality constraints so every crew occupies exactly
// one role each slot across their shift window.
import type { CrewDescriptor } from './types';
import type { TimeGrid } from './time-grid';
import type { RoleSlotVariable } from './role-slot-variables';
import { buildCrewShiftSlotMap } from './crew-shifts';
import { slotIndexToMinute } from './time-grid';

export interface PerSlotConstraintCoefficient {
  variable: RoleSlotVariable;
  coefficient: number;
}

export interface PerSlotConstraint {
  crewId: string;
  slotIndex: number;
  slotMinute: number;
  coefficients: PerSlotConstraintCoefficient[];
  rhs: number;
  variableCount: number;
}

export interface BuildPerSlotConstraintParams {
  crew: CrewDescriptor[];
  grid: TimeGrid;
  roleSlotVariables: RoleSlotVariable[];
}

function buildCrewSlotVariableIndex(
  roleSlotVariables: RoleSlotVariable[]
): Map<string, Map<number, RoleSlotVariable[]>> {
  const index = new Map<string, Map<number, RoleSlotVariable[]>>();
  for (const variable of roleSlotVariables) {
    let crewMap = index.get(variable.crewId);
    if (!crewMap) {
      crewMap = new Map();
      index.set(variable.crewId, crewMap);
    }
    let slotList = crewMap.get(variable.slotIndex);
    if (!slotList) {
      slotList = [];
      crewMap.set(variable.slotIndex, slotList);
    }
    slotList.push(variable);
  }
  return index;
}

export function buildPerSlotConstraints({
  crew,
  grid,
  roleSlotVariables,
}: BuildPerSlotConstraintParams): PerSlotConstraint[] {
  const crewShiftMap = buildCrewShiftSlotMap(crew, grid);
  const slotIndex = buildCrewSlotVariableIndex(roleSlotVariables);
  const constraints: PerSlotConstraint[] = [];

  for (const crewMember of crew) {
    const shift = crewShiftMap.get(crewMember.id);
    if (!shift) {
      throw new Error(`Missing shift metadata for crew ${crewMember.id} when building per-slot constraints`);
    }

    const perCrewSlots = slotIndex.get(crewMember.id) ?? new Map<number, RoleSlotVariable[]>();

    for (let slot = shift.startSlot; slot < shift.endSlot; slot++) {
      const variables = perCrewSlots.get(slot) ?? [];
      if (variables.length === 0) {
        throw new Error(
          `Crew ${crewMember.id} has no eligible roles for slot ${slot}; builder must ensure at least one`
        );
      }

      const coefficients: PerSlotConstraintCoefficient[] = variables
        .sort((a, b) => a.roleId - b.roleId || a.slotIndex - b.slotIndex)
        .map((variable) => ({ variable, coefficient: 1 }));

      constraints.push({
        crewId: crewMember.id,
        slotIndex: slot,
        slotMinute: slotIndexToMinute(slot, grid),
        coefficients,
        variableCount: variables.length,
        rhs: 1,
      });
    }
  }

  return constraints;
}
