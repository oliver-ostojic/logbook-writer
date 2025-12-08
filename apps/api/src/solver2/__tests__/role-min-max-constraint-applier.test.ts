import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildCoverageModel, type InMemoryLinearConstraint, type RoleTotalConstraintMetadata } from '../milp-model';
import { buildRoleMinMaxConstraints } from '../role-min-max-constraints';
import { attachRoleMinMaxConstraints } from '../role-min-max-constraint-applier';

function isRoleTotalConstraint(
  constraint: InMemoryLinearConstraint
): constraint is InMemoryLinearConstraint & { metadata: RoleTotalConstraintMetadata } {
  return constraint.family === 'ROLE_TOTAL';
}

describe('role min/max constraint applier', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);
  const constraints = buildRoleMinMaxConstraints({ roles: sampleInput.roles, roleSlotVariables });

  it('attaches inequality constraints to the in-memory model', () => {
    const modelResult = buildCoverageModel(roleSlotVariables);
    const attached = attachRoleMinMaxConstraints(modelResult, constraints);

    expect(attached).toHaveLength(constraints.length);
    expect(modelResult.model.getAllConstraints()).toHaveLength(constraints.length);

    const roleTotalConstraints = attached.filter(isRoleTotalConstraint);

    const registerMin = roleTotalConstraints.find(
      (constraint) =>
        constraint.relation === 'GE' &&
        constraint.metadata.bound === 'MIN' &&
        constraint.metadata.roleId === 1 &&
        constraint.metadata.crewId === 'crew-alpha'
    );

    expect(registerMin).toBeDefined();
    expect(registerMin?.metadata.requestedSlots).toBe(2);
    expect(registerMin?.coefficients.map((c) => c.key).length).toBe(registerMin?.metadata.availableSlotCount);

    const breakMax = roleTotalConstraints.find(
      (constraint) =>
        constraint.relation === 'LE' &&
        constraint.metadata.bound === 'MAX' &&
        constraint.metadata.roleId === 2
    );

    expect(breakMax).toBeDefined();
  });

  it('throws when a referenced variable handle is missing', () => {
    const modelResult = buildCoverageModel([]);
    expect(() => attachRoleMinMaxConstraints(modelResult, constraints)).toThrow(/Missing variable handle/);
  });
});
