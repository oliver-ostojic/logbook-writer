import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildCoverageModel, type InMemoryLinearConstraint, type BlockSizeConstraintMetadata } from '../milp-model';
import { buildBlockSizeConstraints } from '../block-size-constraints';
import { attachBlockSizeConstraints } from '../block-size-constraint-applier';

function isBlockSizeConstraint(
  constraint: InMemoryLinearConstraint
): constraint is InMemoryLinearConstraint & { metadata: BlockSizeConstraintMetadata } {
  return constraint.family === 'BLOCK_SIZE';
}

describe('block-size constraint applier', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
  const constraints = buildBlockSizeConstraints({
    crew: sampleInput.crew,
    roles: sampleInput.roles,
    grid,
    roleSlotVariables,
  });

  it('attaches equality relations for every block constraint', () => {
    const modelResult = buildCoverageModel(roleSlotVariables);
    const attached = attachBlockSizeConstraints(modelResult, constraints);

    expect(attached).toHaveLength(constraints.length);
    expect(modelResult.model.getAllConstraints()).toHaveLength(constraints.length);

    const blockSizeConstraints = attached.filter(isBlockSizeConstraint);
    expect(blockSizeConstraints.length).toBeGreaterThan(0);

    const representative = blockSizeConstraints[0];
    expect(representative.relation).toBe('EQ');
    expect(representative.metadata.blockSize).toBeGreaterThan(1);
    expect(representative.metadata.slotIndexes.length).toBe(representative.metadata.blockSize);
  });

  it('throws when a variable handle is missing', () => {
    const modelResult = buildCoverageModel([]);
    expect(() => attachBlockSizeConstraints(modelResult, constraints)).toThrow(/Missing variable handle/);
  });
});
