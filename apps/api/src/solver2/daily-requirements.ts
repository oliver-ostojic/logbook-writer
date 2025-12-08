// Normalizes per-crew daily requirement rows into slot-aware metadata that can be
// consumed directly by constraint builders (e.g., daily totals, SOLVER roles).
import type { DailyRequirementDescriptor, RoleDescriptor } from './types';
import type { CrewShiftSlots } from './crew-shifts';
import type { TimeGrid } from './time-grid';
import { roleSupportsAnyAssignmentModel } from './assignment-models';

export interface DailyRequirementAssignment {
  roleId: number;
  crewId: string;
  requiredMinutes: number;
  requiredSlots: number;
  shiftStartMinute: number;
  shiftEndMinute: number;
  shiftStartSlot: number;
  shiftEndSlot: number;
  shiftSlotCount: number;
}

// Convert daily rows to per-crew assignments, ensuring we respect the shift bounds
// already cached in `CrewShiftSlots`. Throws if a crew requirement lacks shift data.
export function buildDailyRequirementAssignments(
  requirements: DailyRequirementDescriptor[],
  crewShifts: Map<string, CrewShiftSlots>,
  grid: TimeGrid,
  roles: RoleDescriptor[]
): DailyRequirementAssignment[] {
  const roleLookup = new Map<number, RoleDescriptor>();
  for (const role of roles) {
    roleLookup.set(role.id, role);
  }

  return requirements
    .filter((requirement) =>
      roleSupportsAnyAssignmentModel(roleLookup.get(requirement.roleId), ['DAILY', 'SOLVER'])
    )
    .map((requirement) => {
    const shift = crewShifts.get(requirement.crewId);
    if (!shift) {
      throw new Error(
        `Missing shift metadata for crew ${requirement.crewId} when building daily requirements`
      );
    }

    const requiredSlots = Math.round(requirement.requiredMinutes / grid.slotMinutes);

    return {
      roleId: requirement.roleId,
      crewId: requirement.crewId,
      requiredMinutes: requirement.requiredMinutes,
      requiredSlots,
      shiftStartMinute: shift.shiftStartMinute,
      shiftEndMinute: shift.shiftEndMinute,
      shiftStartSlot: shift.startSlot,
      shiftEndSlot: shift.endSlot,
      shiftSlotCount: shift.slotCount,
      } satisfies DailyRequirementAssignment;
    });
}
