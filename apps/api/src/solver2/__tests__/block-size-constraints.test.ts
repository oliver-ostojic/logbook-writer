import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildBlockSizeConstraints } from '../block-size-constraints';

const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
const baseRoleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);

describe('block-size constraints', () => {
  it('emits equality links for every full block', () => {
    const constraints = buildBlockSizeConstraints({
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      grid,
      roleSlotVariables: baseRoleSlotVariables,
    });

    const registerAlpha = constraints.filter(
      (constraint) => constraint.roleId === 1 && constraint.crewId === 'crew-alpha'
    );

    expect(registerAlpha.length).toBeGreaterThan(0);
    expect(registerAlpha.every((constraint) => constraint.coefficients.length === 2)).toBe(true);
    expect(
      registerAlpha.every(
        (constraint) => constraint.coefficients[0].coefficient === 1 && constraint.coefficients[1].coefficient === -1
      )
    ).toBe(true);
    expect(registerAlpha.every((constraint) => constraint.slotIndexes.length === constraint.blockSize)).toBe(true);

    const breakConstraints = constraints.filter((constraint) => constraint.roleId === 2);
    expect(breakConstraints).toHaveLength(0);
  });

  it('skips blocks when any slot in the block lacks a variable', () => {
    const missingSlotIndex = 6;
    const truncatedVariables = baseRoleSlotVariables.filter(
      (variable) => !(variable.roleId === 1 && variable.crewId === 'crew-alpha' && variable.slotIndex === missingSlotIndex)
    );

    const constraints = buildBlockSizeConstraints({
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      grid,
      roleSlotVariables: truncatedVariables,
    });

    const affectedConstraint = constraints.find(
      (constraint) => constraint.crewId === 'crew-alpha' && constraint.slotPair.includes(missingSlotIndex)
    );

    expect(affectedConstraint).toBeUndefined();
  });
});
