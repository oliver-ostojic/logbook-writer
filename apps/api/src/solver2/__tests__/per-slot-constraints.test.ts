import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildPerSlotConstraints } from '../per-slot-constraints';

const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);

describe('per-slot constraints', () => {
  it('creates equality constraints for every crew slot', () => {
    const constraints = buildPerSlotConstraints({
      crew: sampleInput.crew,
      grid,
      roleSlotVariables,
    });

    expect(constraints.length).toBeGreaterThan(0);

    const alphaSlot = constraints.find(
      (constraint) => constraint.crewId === 'crew-alpha' && constraint.slotIndex === 6
    );

    expect(alphaSlot).toBeDefined();
    expect(alphaSlot?.coefficients.every((coefficient) => coefficient.coefficient === 1)).toBe(true);
    expect(alphaSlot?.rhs).toBe(1);
    expect(alphaSlot?.variableCount).toBeGreaterThan(0);
  });

  it('fails fast when a slot has zero eligible roles', () => {
    const filtered = roleSlotVariables.filter(
      (variable) => !(variable.crewId === 'crew-alpha' && variable.slotIndex === 6)
    );

    expect(() => buildPerSlotConstraints({ crew: sampleInput.crew, grid, roleSlotVariables: filtered })).toThrow(
      /no eligible roles/
    );
  });
});
