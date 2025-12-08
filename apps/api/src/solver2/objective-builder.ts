// Coordinates preference-based objective weights plus consecutive gap penalties so
// the MILP builder can attach a complete objective vector in one place.
import type {
  PreferenceDescriptor,
  CrewDescriptor,
  RoleDescriptor,
  CrewRoleFairnessHistoryDescriptor,
  AssignmentModelValue,
} from './types';
import type { RoleSlotVariable } from './role-slot-variables';
import type { TimeGrid } from './time-grid';
import type {
  BuildModelResult,
  ObjectiveTerm,
  PreferenceObjectiveMetadata,
  FairnessObjectiveMetadata,
} from './milp-model';
import { getVariableHandleKey } from './milp-model';
import { buildCrewShiftSlotMap, type CrewShiftSlots } from './crew-shifts';
import { minutesToSlotIndex } from './time-grid';
import { PreferenceType } from '@logbook-writer/shared-types';
import {
  buildConsecutivePolicyGapPenalties,
  type ConsecutiveGapPenalty,
  type ConsecutivePenaltySource,
} from './consecutive-policy-penalties';
import { attachConsecutivePolicyPenalties } from './consecutive-policy-penalty-applier';

export interface BuildObjectiveParams {
  modelResult: BuildModelResult;
  roleSlotVariables: RoleSlotVariable[];
  preferences: PreferenceDescriptor[];
  crew: CrewDescriptor[];
  roles: RoleDescriptor[];
  grid: TimeGrid;
  fairnessHistory: CrewRoleFairnessHistoryDescriptor[];
}

export interface ObjectiveBuildResult {
  preferenceTerms: ObjectiveTerm[];
  consecutiveTerms: ObjectiveTerm[];
  fairnessTerms: ObjectiveTerm[];
}

interface CrewRoleVariableGroup {
  crewId: string;
  roleId: number;
  variables: RoleSlotVariable[];
}

const crewRoleKey = (crewId: string, roleId: number) => `${crewId}:${roleId}`;

export function buildObjective({
  modelResult,
  roleSlotVariables,
  preferences,
  crew,
  roles,
  grid,
  fairnessHistory,
}: BuildObjectiveParams): ObjectiveBuildResult {
  const groupedVariables = groupRoleSlotVariables(roleSlotVariables);
  const crewShiftMap = buildCrewShiftSlotMap(crew, grid);
  const roleLookup = new Map(roles.map((role) => [role.id, role]));

  const preferenceTerms = buildPreferenceObjectiveTerms({
    modelResult,
    preferences,
    groupedVariables,
    crewShiftMap,
    roleLookup,
    grid,
  });

  const policyPenalties = buildConsecutivePolicyGapPenalties({
    roles,
    roleSlotVariables,
  });
  const preferencePenalties = buildPreferenceConsecutiveGapPenalties({
    preferences,
    groupedVariables,
  });
  const consecutiveTerms = attachConsecutivePolicyPenalties(modelResult, [
    ...policyPenalties,
    ...preferencePenalties,
  ]);

  const fairnessTerms = buildFairnessObjectiveTerms({
    modelResult,
    roleSlotVariables,
    roles,
    crew,
    fairnessHistory,
  });

  return { preferenceTerms, consecutiveTerms, fairnessTerms };
}

interface BuildPreferenceObjectiveTermParams {
  modelResult: BuildModelResult;
  preferences: PreferenceDescriptor[];
  groupedVariables: Map<string, RoleSlotVariable[]>;
  crewShiftMap: Map<string, CrewShiftSlots>;
  roleLookup: Map<number, RoleDescriptor>;
  grid: TimeGrid;
}

function buildPreferenceObjectiveTerms({
  modelResult,
  preferences,
  groupedVariables,
  crewShiftMap,
  roleLookup,
  grid,
}: BuildPreferenceObjectiveTermParams): ObjectiveTerm[] {
  const terms: ObjectiveTerm[] = [];

  for (const preference of preferences) {
    if (!preferenceSupportsSlotAssignments(preference)) {
      continue;
    }
    const weight = computeEffectiveWeight(preference);
    if (weight <= 0) {
      continue;
    }

    switch (preference.preferenceType) {
      case PreferenceType.FIRST_HOUR:
        handleFirstHourPreference({
          modelResult,
          preference,
          groupedVariables,
          crewShiftMap,
          weight,
          terms,
        });
        break;
      case PreferenceType.FAVORITE:
        handleFavoritePreference({
          modelResult,
          preference,
          groupedVariables,
          weight,
          terms,
        });
        break;
      case PreferenceType.TIMING:
        handleTimingPreference({
          modelResult,
          preference,
          groupedVariables,
          crewShiftMap,
          roleLookup,
          grid,
          weight,
          terms,
        });
        break;
      case PreferenceType.CONSECUTIVE:
        // Handled separately via consecutive penalty builder.
        break;
      default:
        break;
    }
  }

  return terms;
}

const FAIRNESS_SURPLUS_PENALTY = (() => {
  const parsed = Number(process.env.FAIRNESS_SURPLUS_PENALTY ?? '5');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
})();

const FAIRNESS_MIN_STD_DEV = (() => {
  const parsed = Number(process.env.FAIRNESS_MIN_STD_DEV ?? '60');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
})();

const SLOT_BASED_ASSIGNMENT_MODELS: AssignmentModelValue[] = ['HOURLY', 'HOURLY_WINDOW', 'SOLVER'];

interface BuildFairnessObjectiveTermParams {
  modelResult: BuildModelResult;
  roleSlotVariables: RoleSlotVariable[];
  roles: RoleDescriptor[];
  crew: CrewDescriptor[];
  fairnessHistory: CrewRoleFairnessHistoryDescriptor[];
}

interface FairnessPenaltyDescriptor {
  coefficient: number;
  surplusMinutes: number;
  averageMinutes: number;
  lookbackDays: number;
  zScore: number;
}

const fairnessKey = (roleId: number, crewId: string) => `${roleId}:${crewId}`;

function buildFairnessObjectiveTerms({
  modelResult,
  roleSlotVariables,
  roles,
  crew,
  fairnessHistory,
}: BuildFairnessObjectiveTermParams): ObjectiveTerm[] {
  if (!fairnessHistory.length || FAIRNESS_SURPLUS_PENALTY <= 0) {
    return [];
  }

  const roleCrewMap = new Map<number, Set<string>>();
  for (const crewMember of crew) {
    for (const roleId of crewMember.roleIds) {
      if (!roleCrewMap.has(roleId)) {
        roleCrewMap.set(roleId, new Set());
      }
      roleCrewMap.get(roleId)!.add(crewMember.id);
    }
  }

  const penalties = new Map<string, FairnessPenaltyDescriptor>();

  for (const role of roles) {
    if (!role.fairnessTracking?.enabled) {
      continue;
    }
    const eligibleCrew = roleCrewMap.get(role.id);
    if (!eligibleCrew || eligibleCrew.size === 0) {
      continue;
    }

    const minutesByCrew = new Map<string, number>();
    for (const entry of fairnessHistory) {
      if (entry.roleId !== role.id) {
        continue;
      }
      if (!eligibleCrew.has(entry.crewId)) {
        continue;
      }
      const current = minutesByCrew.get(entry.crewId) ?? 0;
      const updated = current + entry.minutesAssigned;
      minutesByCrew.set(entry.crewId, updated);
    }

    const crewCount = eligibleCrew.size;
    if (crewCount === 0) {
      continue;
    }

    let totalMinutes = 0;
    const crewMinutes: number[] = [];
    for (const crewId of eligibleCrew) {
      const minutes = minutesByCrew.get(crewId) ?? 0;
      crewMinutes.push(minutes);
      totalMinutes += minutes;
    }

    const averageMinutes = crewCount > 0 ? totalMinutes / crewCount : 0;
    if (averageMinutes <= 0) {
      continue;
    }

    const variance =
      crewMinutes.reduce((sum, value) => sum + Math.pow(value - averageMinutes, 2), 0) /
      crewCount;
    const stdDev = Math.sqrt(variance);
    const effectiveStdDev = Math.max(stdDev, FAIRNESS_MIN_STD_DEV);

    for (const crewId of eligibleCrew) {
      const minutes = minutesByCrew.get(crewId) ?? 0;
      const zScore = (minutes - averageMinutes) / effectiveStdDev;
      if (zScore <= 0) {
        continue;
      }
      const surplus = Math.max(0, minutes - averageMinutes);
      const coefficient = FAIRNESS_SURPLUS_PENALTY * zScore;
      if (coefficient <= 0) {
        continue;
      }
      penalties.set(
        fairnessKey(role.id, crewId),
        {
          coefficient,
          surplusMinutes: surplus,
          averageMinutes,
          lookbackDays: role.fairnessTracking.lookbackDays ?? 0,
          zScore,
        }
      );
    }
  }

  if (penalties.size === 0) {
    return [];
  }

  const terms: ObjectiveTerm[] = [];
  for (const variable of roleSlotVariables) {
    const penalty = penalties.get(fairnessKey(variable.roleId, variable.crewId));
    if (!penalty) {
      continue;
    }
    pushFairnessTerm({
      modelResult,
      variable,
      coefficient: penalty.coefficient,
      metadata: {
        crewId: variable.crewId,
        roleId: variable.roleId,
        surplusMinutes: penalty.surplusMinutes,
        averageMinutes: penalty.averageMinutes,
        lookbackDays: penalty.lookbackDays,
        zScore: penalty.zScore,
      },
      terms,
    });
  }

  return terms;
}

function computeEffectiveWeight(preference: PreferenceDescriptor): number {
  const base = preference.baseWeight ?? 0;
  const crewWeight = preference.crewWeight ?? 0;
  const adaptiveBoost = preference.adaptiveBoost ?? 1;
  const bankedBoost = preference.bankedWeightBoost ?? 1;
  return base * crewWeight * adaptiveBoost * bankedBoost;
}

function preferenceSupportsSlotAssignments(preference: PreferenceDescriptor): boolean {
  if (!preference.assignmentModels?.length) {
    return false;
  }
  return preference.assignmentModels.some((model) =>
    SLOT_BASED_ASSIGNMENT_MODELS.includes(model)
  );
}

function handleFirstHourPreference({
  modelResult,
  preference,
  groupedVariables,
  crewShiftMap,
  weight,
  terms,
}: {
  modelResult: BuildModelResult;
  preference: PreferenceDescriptor;
  groupedVariables: Map<string, RoleSlotVariable[]>;
  crewShiftMap: Map<string, CrewShiftSlots>;
  weight: number;
  terms: ObjectiveTerm[];
}): void {
  if (preference.roleId === null) {
    return;
  }
  const shift = crewShiftMap.get(preference.crewId);
  if (!shift || shift.slotCount === 0) {
    return;
  }
  const firstSlot = shift.startSlot;
  const variable = findVariable(groupedVariables, preference.crewId, preference.roleId, firstSlot);
  if (!variable) {
    return;
  }

  pushPreferenceTerm({
    modelResult,
    variable,
    weight,
    terms,
    metadata: {
      kind: 'FIRST_HOUR',
      crewId: preference.crewId,
      roleId: preference.roleId,
      slotIndex: firstSlot,
      preferenceType: preference.preferenceType,
      rolePreferenceId: preference.rolePreferenceId,
    },
  });
}

function handleFavoritePreference({
  modelResult,
  preference,
  groupedVariables,
  weight,
  terms,
}: {
  modelResult: BuildModelResult;
  preference: PreferenceDescriptor;
  groupedVariables: Map<string, RoleSlotVariable[]>;
  weight: number;
  terms: ObjectiveTerm[];
}): void {
  if (preference.roleId === null) {
    return;
  }

  const variables = groupedVariables.get(crewRoleKey(preference.crewId, preference.roleId));
  if (!variables?.length) {
    return;
  }

  for (const variable of variables) {
    pushPreferenceTerm({
      modelResult,
      variable,
      weight,
      terms,
      metadata: {
        kind: 'FAVORITE',
        crewId: preference.crewId,
        roleId: preference.roleId,
        slotIndex: variable.slotIndex,
        preferenceType: preference.preferenceType,
        rolePreferenceId: preference.rolePreferenceId,
      },
    });
  }
}

function handleTimingPreference({
  modelResult,
  preference,
  groupedVariables,
  crewShiftMap,
  roleLookup,
  grid,
  weight,
  terms,
}: {
  modelResult: BuildModelResult;
  preference: PreferenceDescriptor;
  groupedVariables: Map<string, RoleSlotVariable[]>;
  crewShiftMap: Map<string, CrewShiftSlots>;
  roleLookup: Map<number, RoleDescriptor>;
  grid: TimeGrid;
  weight: number;
  terms: ObjectiveTerm[];
}): void {
  if (!preference.intValue || preference.roleId === null) {
    return;
  }

  const variables = groupedVariables.get(crewRoleKey(preference.crewId, preference.roleId));
  if (!variables?.length) {
    return;
  }

  const shift = crewShiftMap.get(preference.crewId);
  if (!shift || shift.slotCount === 0) {
    return;
  }

  const role = roleLookup.get(preference.roleId);
  if (!role) {
    return;
  }

  const shiftDurationMinutes = shift.shiftEndMinute - shift.shiftStartMinute;
  const windowStartMinute =
    shift.shiftStartMinute + (role.windowOffsets?.startOffsetMin ?? 0);
  const windowEndMinute =
    shift.shiftStartMinute + (role.windowOffsets?.endOffsetMin ?? shiftDurationMinutes);
  const startSlot = minutesToSlotIndex(windowStartMinute, grid, 'floor');
  const endSlotExclusive = minutesToSlotIndex(windowEndMinute, grid, 'ceil');
  if (endSlotExclusive <= startSlot) {
    return;
  }

  const span = Math.max(1, endSlotExclusive - startSlot - 1);
  const desireLate = preference.intValue > 0;

  for (const variable of variables) {
    if (variable.slotIndex < startSlot || variable.slotIndex >= endSlotExclusive) {
      continue;
    }
    const offset = Math.max(0, variable.slotIndex - startSlot);
    const normalized = span === 0 ? 1 : Math.min(1, offset / span);
    const score = desireLate ? normalized : 1 - normalized;
    if (score <= 0) {
      continue;
    }
    pushPreferenceTerm({
      modelResult,
      variable,
      weight: weight * score,
      terms,
      metadata: {
        kind: 'TIMING',
        crewId: preference.crewId,
        roleId: preference.roleId,
        slotIndex: variable.slotIndex,
        preferenceType: preference.preferenceType,
        rolePreferenceId: preference.rolePreferenceId,
        normalizedPosition: normalized,
        timingPreference: desireLate ? 'LATE' : 'EARLY',
      },
    });
  }
}

function pushPreferenceTerm({
  modelResult,
  variable,
  weight,
  terms,
  metadata,
}: {
  modelResult: BuildModelResult;
  variable: RoleSlotVariable;
  weight: number;
  terms: ObjectiveTerm[];
  metadata: PreferenceObjectiveMetadata;
}): void {
  if (weight === 0) {
    return;
  }
  const key = getVariableHandleKey(variable);
  const handle = modelResult.variableHandles.get(key);
  if (!handle) {
    throw new Error(`Missing variable handle for key ${key}`);
  }
  const term: ObjectiveTerm = {
    family: 'PREFERENCE',
    metadata,
    coefficient: weight,
    key: handle.key,
    cpVar: handle.cpVar,
  };
  modelResult.model.addObjectiveTerm(term);
  terms.push(term);
}

function findVariable(
  groupedVariables: Map<string, RoleSlotVariable[]>,
  crewId: string,
  roleId: number,
  slotIndex: number
): RoleSlotVariable | undefined {
  const variables = groupedVariables.get(crewRoleKey(crewId, roleId));
  if (!variables?.length) {
    return undefined;
  }
  return variables.find((variable) => variable.slotIndex === slotIndex);
}

function pushFairnessTerm({
  modelResult,
  variable,
  coefficient,
  metadata,
  terms,
}: {
  modelResult: BuildModelResult;
  variable: RoleSlotVariable;
  coefficient: number;
  metadata: FairnessObjectiveMetadata;
  terms: ObjectiveTerm[];
}): void {
  if (coefficient === 0) {
    return;
  }
  const key = getVariableHandleKey(variable);
  const handle = modelResult.variableHandles.get(key);
  if (!handle) {
    throw new Error(`Missing variable handle for key ${key}`);
  }
  const term: ObjectiveTerm = {
    family: 'FAIRNESS',
    metadata,
    coefficient,
    key: handle.key,
    cpVar: handle.cpVar,
  };
  modelResult.model.addObjectiveTerm(term);
  terms.push(term);
}

function groupRoleSlotVariables(
  roleSlotVariables: RoleSlotVariable[]
): Map<string, RoleSlotVariable[]> {
  const map = new Map<string, RoleSlotVariable[]>();
  for (const variable of roleSlotVariables) {
    const key = crewRoleKey(variable.crewId, variable.roleId);
    const list = map.get(key);
    if (list) {
      list.push(variable);
    } else {
      map.set(key, [variable]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.slotIndex - b.slotIndex);
  }
  return map;
}

interface BuildPreferenceConsecutivePenaltyParams {
  preferences: PreferenceDescriptor[];
  groupedVariables: Map<string, RoleSlotVariable[]>;
}

function buildPreferenceConsecutiveGapPenalties({
  preferences,
  groupedVariables,
}: BuildPreferenceConsecutivePenaltyParams): ConsecutiveGapPenalty[] {
  const penalties: ConsecutiveGapPenalty[] = [];

  for (const preference of preferences) {
    if (preference.preferenceType !== PreferenceType.CONSECUTIVE) {
      continue;
    }
    if (!preferenceSupportsSlotAssignments(preference)) {
      continue;
    }
    if (!preference.intValue || preference.roleId === null) {
      continue;
    }
    const weight = computeEffectiveWeight(preference);
    if (weight <= 0) {
      continue;
    }

    const variables = groupedVariables.get(crewRoleKey(preference.crewId, preference.roleId));
    if (!variables || variables.length <= 1) {
      continue;
    }

    const penaltySource: ConsecutivePenaltySource =
      preference.intValue > 0 ? 'PREFERENCE_CONTIGUOUS' : 'PREFERENCE_SWITCH';
    const signedWeight = preference.intValue > 0 ? weight : -weight;

    for (let index = 0; index < variables.length - 1; index++) {
      const current = variables[index];
      const next = variables[index + 1];
      if (next.slotIndex - current.slotIndex !== 1) {
        continue;
      }
      penalties.push({
        crewId: preference.crewId,
        roleId: preference.roleId,
        slotPair: [current.slotIndex, next.slotIndex],
        weight: signedWeight,
        variables: [current, next],
        source: penaltySource,
        rolePreferenceId: preference.rolePreferenceId,
        preferenceType: preference.preferenceType,
      });
    }
  }

  return penalties;
}