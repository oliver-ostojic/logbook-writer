import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import {
  buildCrewRoleSlotWindow,
  crewSatisfiesMinShiftLength,
  enumerateEligibleSlots,
} from '../slot-eligibility';

describe('slot eligibility helpers', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const registerRole = sampleInput.roles[0];
  const breakRole = sampleInput.roles[1];
  const alphaCrew = sampleInput.crew[0];

  it('clamps role windows to store hours when allowOutsideStoreHours is false', () => {
    const window = buildCrewRoleSlotWindow(alphaCrew, registerRole, grid);
    expect(window).not.toBeNull();
    expect(window?.startMinute).toBe(grid.storeOpenMinute);
    expect(window?.endMinute).toBe(alphaCrew.shiftEndMin);
    expect(window?.startSlot).toBe(grid.storeOpenSlotIndex);
    expect(window?.endSlot).toBe(16); // (780 - 300) / 30

    const slots = window ? enumerateEligibleSlots(window) : [];
    expect(slots[0]).toBe(grid.storeOpenSlotIndex);
    expect(slots.at(-1)).toBe(15);
  });

  it('applies role window offsets relative to crew shift start', () => {
    const window = buildCrewRoleSlotWindow(alphaCrew, breakRole, grid);
    expect(window).not.toBeNull();
    expect(window?.startMinute).toBe(alphaCrew.shiftStartMin + 180);
    expect(window?.endMinute).toBe(alphaCrew.shiftStartMin + 300);
    expect(window?.startSlot).toBe(6);
    expect(window?.endSlot).toBe(10);

    const slots = window ? enumerateEligibleSlots(window) : [];
    expect(slots).toEqual([6, 7, 8, 9]);
  });

  it('rejects crews that do not meet the min shift length for a role', () => {
    const shortCrew = {
      ...alphaCrew,
      shiftEndMin: alphaCrew.shiftStartMin + 240,
    };

    expect(crewSatisfiesMinShiftLength(shortCrew, breakRole)).toBe(false);
    const window = buildCrewRoleSlotWindow(shortCrew, breakRole, grid);
    expect(window).toBeNull();
  });
});
