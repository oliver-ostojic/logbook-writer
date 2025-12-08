// Applies block-size snapping constraints by linking all slots inside a block so
// they either fire together or stay inactive together.
import type { BlockSizeConstraint } from './block-size-constraints';
import {
  getVariableHandleKey,
  type BuildModelResult,
  type InMemoryLinearConstraint,
} from './milp-model';

export function attachBlockSizeConstraints(
  modelResult: BuildModelResult,
  constraints: BlockSizeConstraint[]
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
      family: 'BLOCK_SIZE',
      relation: 'EQ',
      metadata: {
        roleId: constraint.roleId,
        crewId: constraint.crewId,
        blockSize: constraint.blockSize,
        blockStartSlot: constraint.blockStartSlot,
        slotPair: constraint.slotPair,
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
