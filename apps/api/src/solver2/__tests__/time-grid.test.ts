import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid, minutesToSlotIndex, slotIndexToMinute, enumerateSlotsBetween } from '../time-grid';
import { buildCrewShiftSlots } from '../crew-shifts';

describe('time grid utilities', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);

  it('expands grid to cover earliest crew start and latest crew end', () => {
    expect(grid.startMinute).toBe(300);
    expect(grid.endMinute).toBe(1320);
    expect(grid.slotMinutes).toBe(30);
    expect(grid.slotCount).toBe((grid.endMinute - grid.startMinute) / grid.slotMinutes);
    expect(grid.storeOpenSlotIndex).toBe(6); // (480 - 300) / 30
    expect(grid.storeCloseSlotIndex).toBe(32); // (1260 - 300) / 30
  });

  it('converts minutes to slot indexes with rounding strategies', () => {
    expect(minutesToSlotIndex(300, grid)).toBe(0);
    expect(minutesToSlotIndex(315, grid)).toBe(0);
    expect(minutesToSlotIndex(330, grid)).toBe(1);
    expect(minutesToSlotIndex(329, grid, 'ceil')).toBe(1);
    expect(minutesToSlotIndex(1320, grid)).toBe(grid.slotCount);
    expect(slotIndexToMinute(0, grid)).toBe(300);
    expect(slotIndexToMinute(6, grid)).toBe(480);
  });

  it('enumerates slots between two minute bounds', () => {
    const slots = enumerateSlotsBetween(480, 600, grid);
    expect(slots).toEqual([6, 7, 8, 9]);
  });

  it('builds crew shift slot metadata', () => {
    const alpha = buildCrewShiftSlots(sampleInput.crew[0], grid);
    expect(alpha.startSlot).toBe(0);
    expect(alpha.endSlot).toBe(16);
    expect(alpha.slotCount).toBe(16);

    const beta = buildCrewShiftSlots(sampleInput.crew[1], grid);
    expect(beta.startSlot).toBe(10); // (600 - 300) / 30
    expect(beta.endSlot).toBe(34); // (1320 - 300) / 30
    expect(beta.slotCount).toBe(24);
  });
});
