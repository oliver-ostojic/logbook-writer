// Converts high-level coverage constraints into MILP equality row descriptors so the
// CP-SAT model builder can attach actual solver variables later on.
import type { CoverageConstraint } from './coverage-constraints';
import type { RoleSlotVariable } from './role-slot-variables';
import type { CoverageConstraintType } from './coverage-constraints';

export interface EqualityCoefficient {
  variable: RoleSlotVariable;
  coefficient: number;
}

export interface CoverageEqualityRow {
  type: CoverageConstraintType;
  roleId: number;
  rhs: number;
  coefficients: EqualityCoefficient[];
  metadata: CoverageConstraint['metadata'];
  isSatisfiableGivenVariables: boolean;
}

function sortVariablesForDeterminism(variables: RoleSlotVariable[]): RoleSlotVariable[] {
  return [...variables].sort((a, b) => {
    if (a.slotIndex !== b.slotIndex) {
      return a.slotIndex - b.slotIndex;
    }
    return a.crewId.localeCompare(b.crewId);
  });
}

// Generate equality rows with unit coefficients. The solver later enforces that
// the sum of these binary variables equals the required slot count.
export function buildCoverageEqualityRows(
  constraints: CoverageConstraint[]
): CoverageEqualityRow[] {
  return constraints.map((constraint) => {
    const orderedVariables = sortVariablesForDeterminism(constraint.variables);
    const coefficients: EqualityCoefficient[] = orderedVariables.map((variable) => ({
      variable,
      coefficient: 1,
    }));

    const maxPossible = coefficients.length; // with binary vars each contributes at most 1
    const rhs = constraint.requiredSlotCount;

    return {
      type: constraint.type,
      roleId: constraint.roleId,
      rhs,
      coefficients,
      metadata: constraint.metadata,
      isSatisfiableGivenVariables: maxPossible >= rhs,
    } satisfies CoverageEqualityRow;
  });
}
