import { describe, it, expect } from 'vitest';
import { ConsecutivePolicy } from '@prisma/client';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildConsecutivePolicyGapPenalties } from '../consecutive-policy-penalties';
import { attachConsecutivePolicyPenalties } from '../consecutive-policy-penalty-applier';
import { buildCoverageModel } from '../milp-model';

describe('consecutive policy penalty applier', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const preferredRoles = sampleInput.roles.map((role) =>
    role.id === 3
      ? {
          ...role,
          consecutivePolicy: 'PREFERRED' as ConsecutivePolicy,
        }
      : role
  );
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, preferredRoles, grid);
  const penalties = buildConsecutivePolicyGapPenalties({
    roles: preferredRoles,
    roleSlotVariables,
  });

  it('adds auxiliary constraints and objective terms for each penalty', () => {
    expect(penalties.length).toBeGreaterThan(0);

    const modelResult = buildCoverageModel(roleSlotVariables);
    const attached = attachConsecutivePolicyPenalties(modelResult, penalties);

    expect(attached).toHaveLength(penalties.length);

    const consecutiveConstraints = modelResult.model
      .getAllConstraints()
      .filter(
        (constraint) =>
          constraint.family === 'CONSECUTIVE' &&
          'kind' in constraint.metadata &&
          (constraint.metadata as any).kind.startsWith('PREFERRED_GAP_')
      );

    expect(consecutiveConstraints).toHaveLength(penalties.length * 2);

    const consecutiveTerms = modelResult.model
      .getObjectiveTerms()
      .filter((term) => term.family === 'CONSECUTIVE');

    expect(consecutiveTerms).toHaveLength(penalties.length);
    expect(consecutiveTerms.every((term) => term.coefficient < 0)).toBe(true);
  });

  it('throws when penalty variables are missing handles', () => {
    const modelResult = buildCoverageModel([]);
    expect(() => attachConsecutivePolicyPenalties(modelResult, penalties)).toThrow(
      /Missing variable handle/
    );
  });
});
