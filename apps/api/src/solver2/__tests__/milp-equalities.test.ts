import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildHourlyRequirementWindows } from '../hourly-coverage';
import { buildWindowRequirementRanges } from '../window-coverage';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildCoverageConstraints } from '../coverage-constraints';
import { buildCoverageEqualityRows } from '../milp-equalities';

describe('MILP equality rows', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const hourlyWindows = buildHourlyRequirementWindows(sampleInput.hourlyRequirements, grid);
  const windowRanges = buildWindowRequirementRanges(sampleInput.windowRequirements, grid);
  const roles = sampleInput.roles.map((role) => ({ ...role }));
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, roles, grid);
  const coverageConstraints = buildCoverageConstraints({
    roles,
    hourlyWindows,
    windowRanges,
    roleSlotVariables,
  });
  const equalityRows = buildCoverageEqualityRows(coverageConstraints);

  it('generates one equality row per coverage constraint', () => {
    expect(equalityRows).toHaveLength(coverageConstraints.length);
  });

  it('builds hourly equality rows with unit coefficients and feasibility flag', () => {
    const hourlyRow = equalityRows.find(
      (row) => row.type === 'HOURLY' && 'hour' in row.metadata && row.metadata.hour === 8
    );

    expect(hourlyRow).toBeDefined();
    expect(hourlyRow?.coefficients.every((c) => c.coefficient === 1)).toBe(true);
    expect(hourlyRow?.coefficients.map((c) => c.variable.slotIndex)).toEqual([6, 7]);
    expect(hourlyRow?.rhs).toBe(8);
    expect(hourlyRow?.isSatisfiableGivenVariables).toBe(false);
  });

  it('builds window equality rows with deterministic ordering', () => {
    const windowRow = equalityRows.find((row) => row.type === 'WINDOW');
    expect(windowRow).toBeDefined();
    expect(windowRow?.rhs).toBe(32);
    expect(windowRow?.coefficients.length).toBeGreaterThan(0);

    const slotIndexes = windowRow?.coefficients.map((c) => c.variable.slotIndex) ?? [];
    const sorted = [...slotIndexes].sort((a, b) => a - b);
    expect(slotIndexes).toEqual(sorted); // ensures deterministic ordering
    expect(windowRow?.isSatisfiableGivenVariables).toBe(false);
  });
});
