// Normalizes hourly requirement rows into slot-aligned coverage windows so the
// solver can reason about headcount using the shared time grid.
import type { HourlyRequirementDescriptor } from './types';
import type { TimeGrid } from './time-grid';
import { minutesToSlotIndex } from './time-grid';

export interface HourlyRequirementWindow {
  roleId: number;
  hour: number;
  requiredHeadcount: number;
  requiredSlotCount: number;
  startMinute: number;
  endMinute: number;
  startSlot: number;
  endSlot: number;
  slotIndexes: number[];
}

const MINUTES_PER_HOUR = 60;

// Convert a single hourly requirement into slot indexes spanning that hour. The
// resulting object captures both headcount (raw) and the equivalent slot count
// based on the grid's slot duration.
export function buildHourlyRequirementWindow(
  requirement: HourlyRequirementDescriptor,
  grid: TimeGrid
): HourlyRequirementWindow {
  const hourStartMinute = requirement.hour * MINUTES_PER_HOUR;
  const hourEndMinute = hourStartMinute + MINUTES_PER_HOUR;

  const startSlot = minutesToSlotIndex(hourStartMinute, grid, 'floor');
  const endSlot = minutesToSlotIndex(hourEndMinute, grid, 'ceil');

  const slotIndexes: number[] = [];
  for (let slot = startSlot; slot < endSlot; slot++) {
    slotIndexes.push(slot);
  }

  const slotsPerHour = Math.round(MINUTES_PER_HOUR / grid.slotMinutes);
  const requiredSlotCount = requirement.required * slotsPerHour;

  return {
    roleId: requirement.roleId,
    hour: requirement.hour,
    requiredHeadcount: requirement.required,
    requiredSlotCount,
    startMinute: hourStartMinute,
    endMinute: hourEndMinute,
    startSlot,
    endSlot,
    slotIndexes,
  } satisfies HourlyRequirementWindow;
}

// Convenience helper that maps an entire requirement list into slot windows in
// ascending hour order, allowing downstream logic to iterate deterministically.
export function buildHourlyRequirementWindows(
  requirements: HourlyRequirementDescriptor[],
  grid: TimeGrid
): HourlyRequirementWindow[] {
  return requirements.map((req) => buildHourlyRequirementWindow(req, grid));
}
