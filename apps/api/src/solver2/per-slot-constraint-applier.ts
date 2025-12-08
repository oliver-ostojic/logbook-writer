// Wires the one-task-per-slot constraints into the CP-SAT model.
import type { PerSlotConstraint } from './per-slot-constraints';
import {
  getVariableHandleKey,
  type BuildModelResult,
  type InMemoryLinearConstraint,
} from './milp-model';

export function attachPerSlotConstraints(
  modelResult: BuildModelResult,
  constraints: PerSlotConstraint[]
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

    const record: InMemoryLinearConstraint = {
      family: 'PER_SLOT',
      relation: 'EQ',
      metadata: {
        crewId: constraint.crewId,
        slotIndex: constraint.slotIndex,
        slotMinute: constraint.slotMinute,
        variableCount: constraint.variableCount,
      },
      rhs: constraint.rhs,
      coefficients,
    };

    modelResult.model.addLinearConstraint(record);
    attached.push(record);
  }

  return attached;
}
