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
import { buildHourlyRequirementWindows } from './hourly-coverage';
import { buildWindowRequirementRanges } from './window-coverage';
import { buildCoverageConstraints } from './coverage-constraints';
import { buildCoverageEqualityRows } from './milp-equalities';
import { attachCoverageEqualityRows } from './coverage-constraint-applier';
import { buildPerSlotConstraints } from './per-slot-constraints';
import { attachPerSlotConstraints } from './per-slot-constraint-applier';
import { buildBlockSizeConstraints } from './block-size-constraints';
import { attachBlockSizeConstraints } from './block-size-constraint-applier';
import { buildRoleMinMaxConstraints } from './role-min-max-constraints';
import { attachRoleMinMaxConstraints } from './role-min-max-constraint-applier';
import { buildConsecutivePolicyConstraints } from './consecutive-policy-constraints';
import { attachConsecutivePolicyConstraints } from './consecutive-policy-constraint-applier';
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

  const hourlyWindows = buildHourlyRequirementWindows(input.hourlyRequirements, grid);
  const windowRanges = buildWindowRequirementRanges(input.windowRequirements, grid);
  const coverageDescriptors = buildCoverageConstraints({
    roles: input.roles,
    hourlyWindows,
    windowRanges,
    roleSlotVariables,
  });
  const coverageRows = buildCoverageEqualityRows(coverageDescriptors);
  const coverage = attachCoverageEqualityRows(modelResult, coverageRows);

  const perSlotDescriptors = buildPerSlotConstraints({
    crew: input.crew,
    grid,
    roleSlotVariables,
  });
  const perSlot = attachPerSlotConstraints(modelResult, perSlotDescriptors);

  const blockSizeDescriptors = buildBlockSizeConstraints({
    crew: input.crew,
    roles: input.roles,
    grid,
    roleSlotVariables,
  });
  const blockSize = attachBlockSizeConstraints(modelResult, blockSizeDescriptors);

  const roleMinMaxDescriptors = buildRoleMinMaxConstraints({
    roles: input.roles,
    roleSlotVariables,
  });
  const roleTotals = attachRoleMinMaxConstraints(modelResult, roleMinMaxDescriptors);

  const consecutiveDescriptors = buildConsecutivePolicyConstraints({
    crew: input.crew,
    roles: input.roles,
    roleSlotVariables,
  });
  const consecutive = attachConsecutivePolicyConstraints(modelResult, consecutiveDescriptors);

  const objective = buildObjective({
    modelResult,
    roleSlotVariables,
    preferences: input.preferences,
    crew: input.crew,
    roles: input.roles,
    grid,
    fairnessHistory: input.fairnessHistory,
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
