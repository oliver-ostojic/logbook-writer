import { describe, it, expect } from 'vitest';
import sampleInput from '../__fixtures__/sampleInput';
import { buildTimeGrid } from '../time-grid';
import { buildRoleSlotVariables } from '../role-slot-variables';
import { buildCoverageModel, getVariableHandleKey, InMemoryBoolVar } from '../milp-model';

describe('coverage model variable creation', () => {
  const grid = buildTimeGrid(sampleInput.store, sampleInput.crew);
  const roleSlotVariables = buildRoleSlotVariables(sampleInput.crew, sampleInput.roles, grid);

  it('creates a bool var per role-slot combination with deterministic keying', () => {
    const { model, variableHandles } = buildCoverageModel(roleSlotVariables);
    expect(variableHandles.size).toBe(roleSlotVariables.length);

    for (const variable of roleSlotVariables) {
      const key = getVariableHandleKey(variable);
      const handle = variableHandles.get(key);
      expect(handle).toBeDefined();
      expect(handle?.cpVar).toBeInstanceOf(InMemoryBoolVar);
      expect(handle?.cpVar.name).toBe(key);
    }

    expect(model.getAllVariables()).toHaveLength(roleSlotVariables.length);
  });
});
