import type { SolverInputV2 } from './types';
import type { TimeGrid } from './time-grid';
import type { RoleSlotVariable } from './role-slot-variables';
import {
  buildCoverageModel,
  type BuildModelResult,
  type InMemoryLinearConstraint,
} from './milp-model';
import { buildTimeGrid } from './time-grid';
import { buildRoleSlotVariables } from './role-slot-variables';
import { buildObjective, type ObjectiveBuildResult } from './objective-builder';

export interface ConstraintAttachments {
  coverage: InMemoryLinearConstraint[];
  perSlot: InMemoryLinearConstraint[];
  blockSize: InMemoryLinearConstraint[];
  roleTotals: InMemoryLinearConstraint[];
  consecutive: InMemoryLinearConstraint[];
}

export interface BuildAssignmentModelResult {
  grid: TimeGrid;
  roleSlotVariables: RoleSlotVariable[];
  modelResult: BuildModelResult;
  constraints: ConstraintAttachments;
  objective: ObjectiveBuildResult;
}

export function buildAssignmentModel(input: SolverInputV2): BuildAssignmentModelResult {
  const grid = buildTimeGrid(input.store, input.crew);
  const roleSlotVariables = buildRoleSlotVariables(input.crew, input.roles, grid);
  const modelResult = buildCoverageModel(roleSlotVariables);

  // NOTE: The in-TS MILP constraint builders are currently legacy and depended on
  // removed `SolverInputV2` fields (hourly/window/daily requirements, role min/max,
  // block sizes, etc.). The production solver path uses Python Solver V2.
  // We keep a minimal model builder here so the module compiles and objective
  // unit tests can still exercise preference/fairness logic.
  const coverage: InMemoryLinearConstraint[] = [];
  const perSlot: InMemoryLinearConstraint[] = [];
  const blockSize: InMemoryLinearConstraint[] = [];
  const roleTotals: InMemoryLinearConstraint[] = [];
  const consecutive: InMemoryLinearConstraint[] = [];

  const objective = buildObjective({
    modelResult,
    roleSlotVariables,
    preferences: input.preferences,
    crew: input.crew,
    roles: input.roles,
    grid,
    fairnessHistory: input.fairnessHistory,
    shiftHistory: input.shiftHistory,
    skipFairnessWeights: input.skipFairnessWeights,
  });

  return {
    grid,
    roleSlotVariables,
    modelResult,
    constraints: {
      coverage,
      perSlot,
      blockSize,
      roleTotals,
      consecutive,
    },
    objective,
  } satisfies BuildAssignmentModelResult;
}
