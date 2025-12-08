// Applies per-crew role min/max constraints to the CP-SAT model by wiring the
// generated descriptors to their underlying bool variables.
import type { RoleMinMaxConstraint } from './role-min-max-constraints';
import {
  getVariableHandleKey,
  type BuildModelResult,
  type InMemoryLinearConstraint,
} from './milp-model';

export function attachRoleMinMaxConstraints(
  modelResult: BuildModelResult,
  constraints: RoleMinMaxConstraint[]
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

    const relation = constraint.type === 'MIN' ? 'GE' : 'LE';

    const record: InMemoryLinearConstraint = {
      family: 'ROLE_TOTAL',
      relation,
      metadata: {
        roleId: constraint.roleId,
        crewId: constraint.crewId,
        bound: constraint.type,
        requestedSlots: constraint.requestedSlots,
        availableSlotCount: constraint.availableSlotCount,
        isSatisfiableGivenVariables: constraint.isSatisfiableGivenVariables,
      },
      rhs: constraint.rhs,
      coefficients,
    };

    modelResult.model.addLinearConstraint(record);
    attached.push(record);
  }

  return attached;
}
