import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildConsecutivePolicyConstraints } from '../consecutive-policy-constraints';
import { attachConsecutivePolicyConstraints } from '../consecutive-policy-constraint-applier';
import { buildCoverageModel } from '../milp-model';

describe('consecutive policy constraint applier', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);

  it('attaches LE constraints for each consecutive requirement', () => {
    const constraints = buildConsecutivePolicyConstraints({
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      roleSlotVariables,
    });

    const modelResult = buildCoverageModel(roleSlotVariables);
    const attached = attachConsecutivePolicyConstraints(modelResult, constraints);

    expect(attached.length).toBe(constraints.length);
    expect(modelResult.model.getAllConstraints()).toHaveLength(constraints.length);
    expect(attached.every((constraint) => constraint.relation === 'LE')).toBe(true);
  });

  it('throws if a variable handle is missing', () => {
    const constraints = buildConsecutivePolicyConstraints({
      crew: sampleInput.crew,
      roles: sampleInput.roles,
      roleSlotVariables,
    });

    const modelResult = buildCoverageModel([]);
    expect(() => attachConsecutivePolicyConstraints(modelResult, constraints)).toThrow(
      /Missing variable handle/
    );
  });
});
