import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import {
  buildCoverageModel,
  type InMemoryLinearConstraint,
  type PerSlotConstraintMetadata,
} from '../milp-model';
import { buildPerSlotConstraints } from '../per-slot-constraints';
import { attachPerSlotConstraints } from '../per-slot-constraint-applier';

function isPerSlotConstraint(
  constraint: InMemoryLinearConstraint
): constraint is InMemoryLinearConstraint & { metadata: PerSlotConstraintMetadata } {
  return constraint.family === 'PER_SLOT';
}

describe('per-slot constraint applier', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
  const constraints = buildPerSlotConstraints({ crew: sampleInput.crew, grid, roleSlotVariables });

  it('attaches equality constraints for each crew-slot', () => {
    const modelResult = buildCoverageModel(roleSlotVariables);
    const attached = attachPerSlotConstraints(modelResult, constraints);

    expect(attached).toHaveLength(constraints.length);
    expect(modelResult.model.getAllConstraints()).toHaveLength(constraints.length);

    const perSlot = attached.filter(isPerSlotConstraint);
    expect(perSlot.length).toBeGreaterThan(0);

    const alphaSlot = perSlot.find(
      (constraint) => constraint.metadata.crewId === 'crew-alpha' && constraint.metadata.slotIndex === 6
    );
    expect(alphaSlot).toBeDefined();
    expect(alphaSlot?.relation).toBe('EQ');
    expect(alphaSlot?.metadata.variableCount).toBeGreaterThan(0);
  });

  it('throws when a variable handle is missing', () => {
    const modelResult = buildCoverageModel([]);
    expect(() => attachPerSlotConstraints(modelResult, constraints)).toThrow(/Missing variable handle/);
  });
});
