import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildHourlyRequirementWindow, buildHourlyRequirementWindows } from '../hourly-coverage';

describe('hourly coverage normalization', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);

  it('builds a slot-aligned window for a single requirement', () => {
    const requirement = sampleInput.hourlyRequirements[0]; // hour 8, required 4
    const window = buildHourlyRequirementWindow(requirement, grid);

    expect(window.startMinute).toBe(480);
    expect(window.endMinute).toBe(540);
    expect(window.startSlot).toBe(6);
    expect(window.endSlot).toBe(8);
    expect(window.slotIndexes).toEqual([6, 7]);
    expect(window.requiredHeadcount).toBe(4);
    expect(window.requiredSlotCount).toBe(8); // 4 people * 2 slots per hour
  });

  it('maps all requirements deterministically', () => {
    const windows = buildHourlyRequirementWindows(sampleInput.hourlyRequirements, grid);
    expect(windows).toHaveLength(sampleInput.hourlyRequirements.length);
    expect(windows[0].hour).toBeLessThan(windows[1].hour);
  });
});
