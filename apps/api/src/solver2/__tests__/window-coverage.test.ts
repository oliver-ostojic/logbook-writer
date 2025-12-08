import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildWindowRequirementRange, buildWindowRequirementRanges } from '../window-coverage';

describe('window coverage normalization', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);

  it('converts window ranges into slot spans and totals', () => {
    const requirement = sampleInput.windowRequirements[0]; // 8-12, per-hour 4
    const range = buildWindowRequirementRange(requirement, grid);

    expect(range.startMinute).toBe(480);
    expect(range.endMinute).toBe(720);
    expect(range.startSlot).toBe(6);
    expect(range.endSlot).toBe(14);
    expect(range.slotIndexes[0]).toBe(6);
    expect(range.slotIndexes.at(-1)).toBe(13);
    expect(range.durationHours).toBe(4);
    expect(range.totalRequiredHeadcount).toBe(16);
    expect(range.totalRequiredSlots).toBe(32); // 16 headcount * 2 slots per hour
  });

  it('builds ordered ranges for all requirements', () => {
    const ranges = buildWindowRequirementRanges(sampleInput.windowRequirements, grid);
    expect(ranges).toHaveLength(sampleInput.windowRequirements.length);
    expect(ranges[0].startHour).toBe(sampleInput.windowRequirements[0].startHour);
  });
});
