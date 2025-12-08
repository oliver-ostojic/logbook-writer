// Converts each crew shift into slot-aligned metadata keyed by crew ID so other
// modules can look up availability without repeating the math.
import type { CrewDescriptor } from './types';
import type { TimeGrid } from './time-grid';
import { minutesToSlotIndex } from './time-grid';

export interface CrewShiftSlots {
  crewId: string;
  shiftStartMinute: number;
  shiftEndMinute: number;
  startSlot: number;
  endSlot: number;
  slotCount: number;
}

export function buildCrewShiftSlots(crew: CrewDescriptor, grid: TimeGrid): CrewShiftSlots {
  // Ensure the shift is expressed within the overall grid bounds so slot math
  // never produces negative indexes.
  const boundedStart = Math.max(crew.shiftStartMin, grid.startMinute);
  const boundedEnd = Math.min(crew.shiftEndMin, grid.endMinute);

  if (boundedEnd <= boundedStart) {
    // Degenerate case: the shift falls completely outside the grid. Emit a
    // zero-length entry so downstream logic still finds a record.
    return {
      crewId: crew.id,
      shiftStartMinute: boundedStart,
      shiftEndMinute: boundedEnd,
      startSlot: minutesToSlotIndex(boundedStart, grid, 'floor'),
      endSlot: minutesToSlotIndex(boundedStart, grid, 'ceil'),
      slotCount: 0,
    };
  }

  // Normal case: convert the bounded shift to inclusive start / exclusive end
  // slot indexes so the duration becomes `endSlot - startSlot` slots.
  const startSlot = minutesToSlotIndex(boundedStart, grid, 'floor');
  const endSlot = minutesToSlotIndex(boundedEnd, grid, 'ceil');

  return {
    crewId: crew.id,
    shiftStartMinute: boundedStart,
    shiftEndMinute: boundedEnd,
    startSlot,
    endSlot,
    slotCount: Math.max(0, endSlot - startSlot),
  };
}

export function buildCrewShiftSlotMap(
  crewList: CrewDescriptor[],
  grid: TimeGrid
): Map<string, CrewShiftSlots> {
  // Pre-compute a lookup map so call sites can fetch shift slot metadata in O(1)
  // instead of re-running `buildCrewShiftSlots` for the same crew repeatedly.
  const map = new Map<string, CrewShiftSlots>();
  for (const crew of crewList) {
    map.set(crew.id, buildCrewShiftSlots(crew, grid));
  }
  return map;
}
