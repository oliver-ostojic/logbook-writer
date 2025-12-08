// Slot-level eligibility predicates that combine crew shifts, store hours, role
// metadata, and offsets to decide where a role can be placed for a crew.
import type { CrewDescriptor, RoleDescriptor } from './types';
import type { TimeGrid } from './time-grid';
import { minutesToSlotIndex } from './time-grid';

export interface CrewRoleSlotWindow {
  crewId: string;
  roleId: number;
  startMinute: number;
  endMinute: number;
  startSlot: number;
  endSlot: number;
}

// Quick guardrail: some roles (e.g., breaks) require crews to have long enough
// shifts to be eligible. Returns true when the crew duration meets that bar.
export function crewSatisfiesMinShiftLength(
  crew: CrewDescriptor,
  role: RoleDescriptor
): boolean {
  const minMinutes = role.minShiftLengthForRoleAccess;
  if (!minMinutes || minMinutes <= 0) {
    return true;
  }
  const shiftMinutes = crew.shiftEndMin - crew.shiftStartMin;
  return shiftMinutes >= minMinutes;
}

// Optionally clamp a window to store open/close times. Roles that opt in to
// outside-store hours skip this restriction entirely.
function clampToStoreHours(
  startMinute: number,
  endMinute: number,
  grid: TimeGrid,
  allowOutsideStoreHours: boolean
): { startMinute: number; endMinute: number } | null {
  if (allowOutsideStoreHours) {
    return { startMinute, endMinute };
  }

  const clampedStart = Math.max(startMinute, grid.storeOpenMinute);
  const clampedEnd = Math.min(endMinute, grid.storeCloseMinute);

  if (clampedEnd <= clampedStart) {
    return null;
  }

  return { startMinute: clampedStart, endMinute: clampedEnd };
}

// Intersect the remaining window with the role's per-crew offsets (e.g., "break
// must happen 3–5 hours into the shift"). Returns null when the overlap would be
// empty.
function applyRoleWindowOffsets(
  crew: CrewDescriptor,
  role: RoleDescriptor,
  minuteWindow: { startMinute: number; endMinute: number }
): { startMinute: number; endMinute: number } | null {
  if (!role.windowOffsets) {
    return minuteWindow;
  }

  const { startOffsetMin, endOffsetMin } = role.windowOffsets;
  const shiftStart = crew.shiftStartMin;
  const windowStart = shiftStart + startOffsetMin;
  const windowEnd = shiftStart + endOffsetMin;

  const adjustedStart = Math.max(minuteWindow.startMinute, windowStart);
  const adjustedEnd = Math.min(minuteWindow.endMinute, windowEnd);

  if (adjustedEnd <= adjustedStart) {
    return null;
  }

  return { startMinute: adjustedStart, endMinute: adjustedEnd };
}

// Main entrypoint: combine guardrails, store clamping, and role offsets to build
// the minute + slot bounds where a crew can legally perform a role.
export function buildCrewRoleSlotWindow(
  crew: CrewDescriptor,
  role: RoleDescriptor,
  grid: TimeGrid
): CrewRoleSlotWindow | null {
  if (!crewSatisfiesMinShiftLength(crew, role)) {
    return null;
  }

  const shiftWindow = clampToStoreHours(
    crew.shiftStartMin,
    crew.shiftEndMin,
    grid,
    role.allowOutsideStoreHours
  );

  if (!shiftWindow) {
    return null;
  }

  const roleWindow = applyRoleWindowOffsets(crew, role, shiftWindow);
  if (!roleWindow) {
    return null;
  }

  const startSlot = minutesToSlotIndex(roleWindow.startMinute, grid, 'ceil');
  const endSlot = minutesToSlotIndex(roleWindow.endMinute, grid, 'floor');

  if (endSlot <= startSlot) {
    return null;
  }

  return {
    crewId: crew.id,
    roleId: role.id,
    startMinute: roleWindow.startMinute,
    endMinute: roleWindow.endMinute,
    startSlot,
    endSlot,
  };
}

// Convenience helper to iterate over every slot inside the allowed window.
export function enumerateEligibleSlots(window: CrewRoleSlotWindow): number[] {
  const slots: number[] = [];
  for (let slot = window.startSlot; slot < window.endSlot; slot++) {
    slots.push(slot);
  }
  return slots;
}
