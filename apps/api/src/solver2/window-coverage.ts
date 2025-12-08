// Normalizes window-style coverage rows (startHour/endHour ranges) into slot
// intervals so the solver can iterate over contiguous demand blocks per role.
import type { WindowRequirementDescriptor } from './types';
import type { TimeGrid } from './time-grid';
import { minutesToSlotIndex } from './time-grid';

export interface WindowRequirementRange {
  roleId: number;
  startHour: number;
  endHour: number;
  requiredPerHour: number;
  durationHours: number;
  totalRequiredHeadcount: number;
  totalRequiredSlots: number;
  startMinute: number;
  endMinute: number;
  startSlot: number;
  endSlot: number;
  slotIndexes: number[];
}

const MINUTES_PER_HOUR = 60;

// Convert a single window requirement (e.g., "need 2 people per hour from noon to
// 4pm") into slot-aligned metadata, including total slot demand across the range.
export function buildWindowRequirementRange(
  requirement: WindowRequirementDescriptor,
  grid: TimeGrid
): WindowRequirementRange {
  const startMinute = requirement.startHour * MINUTES_PER_HOUR;
  const endMinute = requirement.endHour * MINUTES_PER_HOUR;

  if (endMinute <= startMinute) {
    throw new Error(
      `Invalid window requirement: startHour ${requirement.startHour} must be before endHour ${requirement.endHour}`
    );
  }

  const startSlot = minutesToSlotIndex(startMinute, grid, 'floor');
  const endSlot = minutesToSlotIndex(endMinute, grid, 'ceil');

  const slotIndexes: number[] = [];
  for (let slot = startSlot; slot < endSlot; slot++) {
    slotIndexes.push(slot);
  }

  const durationHours = requirement.endHour - requirement.startHour;
  const slotsPerHour = Math.round(MINUTES_PER_HOUR / grid.slotMinutes);
  const totalRequiredHeadcount = requirement.requiredPerHour * durationHours;
  const totalRequiredSlots = requirement.requiredPerHour * durationHours * slotsPerHour;

  return {
    roleId: requirement.roleId,
    startHour: requirement.startHour,
    endHour: requirement.endHour,
    requiredPerHour: requirement.requiredPerHour,
    durationHours,
    totalRequiredHeadcount,
    totalRequiredSlots,
    startMinute,
    endMinute,
    startSlot,
    endSlot,
    slotIndexes,
  } satisfies WindowRequirementRange;
}

// Bulk helper mirroring the hourly version. Keeps order stable for deterministic
// iteration when building constraints or debugging coverage blocks.
export function buildWindowRequirementRanges(
  requirements: WindowRequirementDescriptor[],
  grid: TimeGrid
): WindowRequirementRange[] {
  return requirements.map((req) => buildWindowRequirementRange(req, grid));
}
