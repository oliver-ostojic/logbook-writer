import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildConsecutivePolicyConstraints } from '../consecutive-policy-constraints';

const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);

function stripRole(variableRoleId: number) {
  return roleSlotVariables.filter((variable) => variable.roleId === variableRoleId);
}

describe('consecutive policy constraints', () => {
  it('emits bridge constraints to keep REQUIRED roles contiguous', () => {
    const constraints = buildConsecutivePolicyConstraints({
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      roleSlotVariables,
    });

    const breakConstraints = constraints.filter((constraint) => constraint.roleId === 2);
    expect(breakConstraints.length).toBeGreaterThan(0);
    expect(breakConstraints.some((constraint) => constraint.kind === 'REQUIRED_BRIDGE')).toBe(true);

    const representative = breakConstraints.find((constraint) => constraint.kind === 'REQUIRED_BRIDGE');
    expect(representative?.coefficients).toHaveLength(3);
    expect(representative?.rhs).toBe(1);
  });

  it('adds gap constraints when intermediate slots are missing', () => {
    const trimmed = roleSlotVariables.filter(
      (variable) => !(variable.roleId === 2 && variable.slotIndex === 7)
    );

    const constraints = buildConsecutivePolicyConstraints({
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      roleSlotVariables: trimmed,
    });

    const gapConstraint = constraints.find(
      (constraint) => constraint.roleId === 2 && constraint.kind === 'REQUIRED_GAP'
    );

    expect(gapConstraint).toBeDefined();
    expect(gapConstraint?.coefficients).toHaveLength(2);
    expect(gapConstraint?.rhs).toBe(1);
  });
});
