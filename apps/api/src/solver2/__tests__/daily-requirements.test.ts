import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildCrewShiftSlotMap } from '../crew-shifts';
import { buildDailyRequirementAssignments } from '../daily-requirements';

describe('daily requirement normalization', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const crewShiftMap = buildCrewShiftSlotMap(sampleInput.crew, grid);
  const roles = sampleInput.roles;

  it('converts required minutes to slots and carries shift metadata', () => {
    const assignments = buildDailyRequirementAssignments(
      sampleInput.dailyRequirements,
      crewShiftMap,
      grid,
      roles
    );
    expect(assignments).toHaveLength(sampleInput.dailyRequirements.length);

    const first = assignments[0];
    expect(first.crewId).toBe('crew-alpha');
    expect(first.roleId).toBe(sampleInput.dailyRequirements[0].roleId);
    expect(first.requiredMinutes).toBe(240);
    expect(first.requiredSlots).toBe(8); // 240 / 30
    expect(first.shiftStartMinute).toBe(300);
    expect(first.shiftEndMinute).toBe(780);
    expect(first.shiftStartSlot).toBe(0);
    expect(first.shiftEndSlot).toBe(16);
    expect(first.shiftSlotCount).toBe(16);
  });

  it('throws when a crew requirement is missing shift metadata', () => {
    const crewShiftMapMissing = new Map(crewShiftMap);
    crewShiftMapMissing.delete('crew-alpha');

    expect(() =>
      buildDailyRequirementAssignments(sampleInput.dailyRequirements, crewShiftMapMissing, grid, roles)
    ).toThrow(/Missing shift metadata/);
  });

  it('skips requirements for roles without DAILY or SOLVER assignment models', () => {
    const assignments = buildDailyRequirementAssignments(
      [
        ...sampleInput.dailyRequirements,
        { roleId: 3, crewId: 'crew-alpha', requiredMinutes: 60 },
      ],
      crewShiftMap,
      grid,
      roles
    );

    expect(assignments).toHaveLength(1);
    expect(assignments[0].roleId).toBe(sampleInput.dailyRequirements[0].roleId);
  });
});
