import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildRoleMinMaxConstraints } from '../role-min-max-constraints';

describe('role min/max constraints', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);

  it('builds per-crew bounds when roles specify min/max slots', () => {
    const constraints = buildRoleMinMaxConstraints({
      roles: sampleInput.roles,
      roleSlotVariables,
    });

    const alphaMin = constraints.find(
      (constraint) => constraint.type === 'MIN' && constraint.roleId === 1 && constraint.crewId === 'crew-alpha'
    );
    expect(alphaMin).toBeDefined();
    expect(alphaMin?.rhs).toBe(2);
    expect(alphaMin?.requestedSlots).toBe(2);
    expect(alphaMin?.availableSlotCount).toBeGreaterThan(2);
    expect(alphaMin?.isSatisfiableGivenVariables).toBe(true);

    const betaMax = constraints.find(
      (constraint) => constraint.type === 'MAX' && constraint.roleId === 1 && constraint.crewId === 'crew-beta'
    );
    expect(betaMax).toBeDefined();
    expect(betaMax?.rhs).toBe(10);
    expect(betaMax?.requestedSlots).toBe(10);
    expect(betaMax?.availableSlotCount).toBeGreaterThan(10);

    const breakMax = constraints.find(
      (constraint) => constraint.type === 'MAX' && constraint.roleId === 2 && constraint.crewId === 'crew-alpha'
    );
    expect(breakMax).toBeDefined();
    expect(breakMax?.rhs).toBe(1);
    expect(breakMax?.coefficients).toHaveLength(breakMax?.availableSlotCount ?? 0);

    const crewBetaRoles = new Set(
      constraints
        .filter((constraint) => constraint.crewId === 'crew-beta')
        .map((constraint) => constraint.roleId)
    );
    expect(crewBetaRoles.has(1)).toBe(true);
    expect(crewBetaRoles.has(3)).toBe(true);
  });

  it('clamps rhs to available slots while flagging unsatisfied bounds', () => {
    const exaggeratedRoles = sampleInput.roles.map((role) =>
      role.id === 1 ? { ...role, minSlots: 100 } : role
    );

    const constraints = buildRoleMinMaxConstraints({
      roles: exaggeratedRoles,
      roleSlotVariables,
    });

    const alphaMin = constraints.find(
      (constraint) => constraint.type === 'MIN' && constraint.roleId === 1 && constraint.crewId === 'crew-alpha'
    );
    expect(alphaMin).toBeDefined();
    expect(alphaMin?.rhs).toBe(alphaMin?.availableSlotCount);
    expect(alphaMin?.requestedSlots).toBe(100);
    expect(alphaMin?.isSatisfiableGivenVariables).toBe(false);
  });
});
