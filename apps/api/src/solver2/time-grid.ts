// Shared timeline helpers that normalize store + crew minutes into slot indexes the
// rest of solver2 can reason about deterministically.
import type { CrewDescriptor, StoreDescriptor } from './types';

// A normalized view of time expressed in equal slots that wrap the entire
// scheduling horizon (store hours ± crew shift padding).
export interface TimeGrid {
  slotMinutes: number;
  startMinute: number;
  endMinute: number;
  slotCount: number;
  storeOpenMinute: number;
  storeCloseMinute: number;
  storeOpenSlotIndex: number;
  storeCloseSlotIndex: number;
}

// Basic math helpers used throughout the module.
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const alignDown = (value: number, step: number) => Math.floor(value / step) * step;
const alignUp = (value: number, step: number) => Math.ceil(value / step) * step;

// Build the canonical slot grid by stretching from the earliest crew start to the
// latest crew end, padding outward to whole-slot boundaries so every other helper
// can safely snap minutes ↔︎ slot indexes.
export function buildTimeGrid(store: StoreDescriptor, crew: CrewDescriptor[]): TimeGrid {
  if (store.baseSlotMinutes <= 0) {
    throw new Error('Store.baseSlotMinutes must be positive');
  }

  const slotMinutes = store.baseSlotMinutes;
  const earliestCrewStart = crew.length
    ? crew.reduce((min, c) => Math.min(min, c.shiftStartMin), Number.POSITIVE_INFINITY)
    : store.openMinutesFromMidnight;
  const latestCrewEnd = crew.length
    ? crew.reduce((max, c) => Math.max(max, c.shiftEndMin), Number.NEGATIVE_INFINITY)
    : store.closeMinutesFromMidnight;

  const gridStart = alignDown(Math.min(store.openMinutesFromMidnight, earliestCrewStart), slotMinutes);
  const gridEnd = alignUp(Math.max(store.closeMinutesFromMidnight, latestCrewEnd), slotMinutes);

  if (!Number.isFinite(gridStart) || !Number.isFinite(gridEnd) || gridEnd <= gridStart) {
    throw new Error('Invalid time bounds for store/crew data');
  }

  const slotCount = Math.round((gridEnd - gridStart) / slotMinutes);

  const grid: TimeGrid = {
    slotMinutes,
    startMinute: gridStart,
    endMinute: gridEnd,
    slotCount,
    storeOpenMinute: store.openMinutesFromMidnight,
    storeCloseMinute: store.closeMinutesFromMidnight,
    storeOpenSlotIndex: 0,
    storeCloseSlotIndex: 0,
  };

  grid.storeOpenSlotIndex = minutesToSlotIndex(store.openMinutesFromMidnight, grid, 'floor');
  grid.storeCloseSlotIndex = minutesToSlotIndex(store.closeMinutesFromMidnight, grid, 'ceil');

  return grid;
}

export function minutesToSlotIndex(
  minute: number,
  grid: TimeGrid,
  rounding: 'floor' | 'ceil' = 'floor'
): number {
  // Translate a minute offset into the nearest slot index using the requested
  // rounding strategy, then clamp the result so callers never see negative
  // indexes or values past the grid end.
  const relative = (minute - grid.startMinute) / grid.slotMinutes;
  const rounded = rounding === 'floor' ? Math.floor(relative) : Math.ceil(relative);
  return clamp(rounded, 0, grid.slotCount);
}

export function slotIndexToMinute(slotIndex: number, grid: TimeGrid): number {
  // Inverse of minutesToSlotIndex – returns the minute value at the start of a
  // slot, again clamping indexes to stay within bounds.
  const clampedIndex = clamp(slotIndex, 0, grid.slotCount);
  return grid.startMinute + clampedIndex * grid.slotMinutes;
}

export function enumerateSlotsBetween(
  startMinute: number,
  endMinute: number,
  grid: TimeGrid
): number[] {
  // Generate the discrete slot indexes covering a minute interval. Useful for
  // iterating coverage windows or shift segments without re-deriving math.
  if (endMinute <= startMinute) {
    return [];
  }
  const startSlot = minutesToSlotIndex(startMinute, grid, 'floor');
  const endSlot = minutesToSlotIndex(endMinute, grid, 'ceil');
  const slots: number[] = [];
  for (let slot = startSlot; slot < endSlot; slot++) {
    slots.push(slot);
  }
  return slots;
}
