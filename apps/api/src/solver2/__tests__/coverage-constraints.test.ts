import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildHourlyRequirementWindows } from '../hourly-coverage';
import { buildWindowRequirementRanges } from '../window-coverage';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildCoverageConstraints } from '../coverage-constraints';
import type { AssignmentModelValue } from '../types';

describe('coverage constraint assembly', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const hourlyWindows = buildHourlyRequirementWindows(sampleInput.hourlyRequirements, grid);
  const windowRanges = buildWindowRequirementRanges(sampleInput.windowRequirements, grid);
  const baseRoles = sampleInput.roles.map((role) => ({ ...role }));
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, baseRoles, grid);

  const constraints = buildCoverageConstraints({
    roles: baseRoles,
    hourlyWindows,
    windowRanges,
    roleSlotVariables,
  });

  it('creates a constraint per hourly requirement with the correct slots', () => {
    const hour8 = constraints.find(
      (constraint) => constraint.type === 'HOURLY' && 'hour' in constraint.metadata && constraint.metadata.hour === 8
    );
    expect(hour8).toBeDefined();
    expect(hour8?.slotIndexes).toEqual([6, 7]);
    expect(hour8?.requiredSlotCount).toBe(8);
    expect(hour8?.variables.every((v) => v.roleId === 1)).toBe(true);
    expect(hour8?.variables.map((v) => v.slotIndex)).toEqual([6, 7]);
  });

  it('builds window constraints with aggregated variables across the range', () => {
    const windowConstraint = constraints.find((constraint) => constraint.type === 'WINDOW');
    expect(windowConstraint).toBeDefined();
    expect(windowConstraint?.slotIndexes[0]).toBe(6);
    expect(windowConstraint?.slotIndexes.at(-1)).toBe(13);
    expect(windowConstraint?.requiredSlotCount).toBe(32);
    expect(windowConstraint?.variables.length).toBeGreaterThan(0);

    // First half of the window only has crew Alpha; later slots include crew Beta too.
    const uniqueCrews = new Set(windowConstraint?.variables.map((v) => v.crewId));
    expect(uniqueCrews.size).toBe(2);
  });

  it('skips hourly and window constraints when the role lacks those assignment models', () => {
    const rolesWithoutHourly = sampleInput.roles.map((role) =>
      role.id === 1
        ? ({ ...role, assignmentModels: ['DAILY'] as AssignmentModelValue[] })
        : ({ ...role })
    );
    const slotVars = buildRoleSlotVariables(sampleInput.crew, rolesWithoutHourly, grid);
    const filteredConstraints = buildCoverageConstraints({
      roles: rolesWithoutHourly,
      hourlyWindows,
      windowRanges,
      roleSlotVariables: slotVars,
    });

    expect(filteredConstraints.length).toBe(0);
  });

  it('emits constraints for every assignment model the role advertises', () => {
    const mixedRoles = sampleInput.roles.map((role) =>
      role.id === 1
        ? ({
            ...role,
            assignmentModels: ['HOURLY', 'HOURLY_WINDOW', 'DAILY'] as AssignmentModelValue[],
          })
        : ({ ...role })
    );
    const slotVars = buildRoleSlotVariables(sampleInput.crew, mixedRoles, grid);
    const filteredConstraints = buildCoverageConstraints({
      roles: mixedRoles,
      hourlyWindows,
      windowRanges,
      roleSlotVariables: slotVars,
    });

    const hourlyConstraints = filteredConstraints.filter((constraint) => constraint.type === 'HOURLY');
    const windowConstraints = filteredConstraints.filter((constraint) => constraint.type === 'WINDOW');

    expect(hourlyConstraints.length).toBeGreaterThan(0);
    expect(windowConstraints.length).toBeGreaterThan(0);
  });
});
