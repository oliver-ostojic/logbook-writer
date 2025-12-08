import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildHourlyRequirementWindows } from '../hourly-coverage';
import { buildWindowRequirementRanges } from '../window-coverage';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildCoverageConstraints } from '../coverage-constraints';
import { buildCoverageEqualityRows } from '../milp-equalities';
import { attachCoverageEqualityRows } from '../coverage-constraint-applier';
import {
  buildCoverageModel,
  type InMemoryLinearConstraint,
  type CoverageConstraintMetadata,
} from '../milp-model';

function isCoverageConstraint(
  constraint: InMemoryLinearConstraint
): constraint is InMemoryLinearConstraint & { metadata: CoverageConstraintMetadata } {
  return constraint.family === 'COVERAGE';
}

describe('coverage constraint applier', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const hourlyWindows = buildHourlyRequirementWindows(sampleInput.hourlyRequirements, grid);
  const windowRanges = buildWindowRequirementRanges(sampleInput.windowRequirements, grid);
  const roles = sampleInput.roles.map((role) => ({ ...role }));
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, roles, grid);
  const coverageConstraints = buildCoverageConstraints({
    roles,
    hourlyWindows,
    windowRanges,
    roleSlotVariables,
  });
  const equalityRows = buildCoverageEqualityRows(coverageConstraints);

  it('attaches equality rows to the model using the existing variable handles', () => {
    const modelResult = buildCoverageModel(roleSlotVariables);
    const constraints = attachCoverageEqualityRows(modelResult, equalityRows);

    expect(constraints).toHaveLength(equalityRows.length);
    expect(modelResult.model.getAllConstraints()).toHaveLength(equalityRows.length);

    const coverageConstraintsAttached = constraints.filter(isCoverageConstraint);

    const hourlyConstraint = coverageConstraintsAttached.find(
      (constraint) =>
        constraint.metadata.coverageType === 'HOURLY' &&
        'hour' in constraint.metadata.coverage &&
        constraint.metadata.coverage.hour === 8
    );

    expect(hourlyConstraint).toBeDefined();
    expect(hourlyConstraint?.coefficients.map((c) => c.key)).toEqual([
      '1:crew-alpha:6',
      '1:crew-alpha:7',
    ]);
  });

  it('throws when a required variable handle is missing', () => {
    const modelResult = buildCoverageModel([]);
    expect(() => attachCoverageEqualityRows(modelResult, equalityRows)).toThrow(/Missing variable handle/);
  });
});
