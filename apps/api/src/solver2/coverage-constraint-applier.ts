// Applies coverage equality rows to the in-memory CP-SAT builder by wiring
// coefficients to their corresponding bool variables.
import type { CoverageEqualityRow } from './milp-equalities';
import {
  getVariableHandleKey,
  type BuildModelResult,
  type InMemoryLinearConstraint,
} from './milp-model';

export function attachCoverageEqualityRows(
  modelResult: BuildModelResult,
  equalityRows: CoverageEqualityRow[]
): InMemoryLinearConstraint[] {
  const constraints: InMemoryLinearConstraint[] = [];

  for (const row of equalityRows) {
    const coefficients = row.coefficients.map(({ variable, coefficient }) => {
      const key = getVariableHandleKey(variable);
      const handle = modelResult.variableHandles.get(key);
      if (!handle) {
        throw new Error(`Missing variable handle for key ${key}`);
      }
      return {
        key,
        cpVar: handle.cpVar,
        coefficient,
      };
    });

    const constraint: InMemoryLinearConstraint = {
      family: 'COVERAGE',
      relation: 'EQ',
      metadata: {
        coverageType: row.type,
        coverage: row.metadata,
      },
      rhs: row.rhs,
      coefficients,
    };

    modelResult.model.addLinearConstraint(constraint);
    constraints.push(constraint);
  }

  return constraints;
}
