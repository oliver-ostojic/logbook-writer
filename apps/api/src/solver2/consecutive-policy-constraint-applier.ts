// Applies consecutive policy constraints to the CP-SAT model.
import type { ConsecutivePolicyConstraint } from './consecutive-policy-constraints';
import {
  getVariableHandleKey,
  type BuildModelResult,
  type InMemoryLinearConstraint,
} from './milp-model';

export function attachConsecutivePolicyConstraints(
  modelResult: BuildModelResult,
  constraints: ConsecutivePolicyConstraint[]
): InMemoryLinearConstraint[] {
  const attached: InMemoryLinearConstraint[] = [];

  for (const constraint of constraints) {
    const coefficients = constraint.coefficients.map(({ variable, coefficient }) => {
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

    const relation = constraint.kind === 'REQUIRED_GAP' ? 'LE' : 'LE';

    const record: InMemoryLinearConstraint = {
      family: 'CONSECUTIVE',
      relation,
      metadata: {
        crewId: constraint.crewId,
        roleId: constraint.roleId,
        kind: constraint.kind,
        slotIndexes: constraint.slotIndexes,
      },
      rhs: constraint.rhs,
      coefficients,
    };

    modelResult.model.addLinearConstraint(record);
    attached.push(record);
  }

  return attached;
}
