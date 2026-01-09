import { PrismaClient } from '@prisma/client';
import type {
  SolverInputV2,
  StoreDescriptor,
  RoleDescriptor,
  RoleFamilyDescriptor,
  CrewDescriptor,
  CoverageWindowDescriptor,
  CrewQuotaDescriptor,
  PreferenceDescriptor,
  AssignmentModelValue,
  BankedPreferenceDescriptor,
  RoleFairnessTrackerDescriptor,
  CrewRoleFairnessHistoryDescriptor,
  CrewShiftHistoryDescriptor,
  RoleRuleDescriptor,
} from './types';
import { startOfDay } from '../utils';
// Legacy preference imports removed

const prisma = new PrismaClient();

export interface BuildSolverInputV2Params {
  storeId: number;
  date: string | Date;
  lookbackDays?: number;
  shiftOverrides?: ShiftOverrideDescriptor[];
}

export interface ShiftOverrideDescriptor {
  crewId: string;
  shiftStartMin: number;
  shiftEndMin: number;
}

const DEFAULT_LOOKBACK_DAYS = 7;
// Legacy preference types and banking constants removed

export async function buildSolverInputV2(
  params: BuildSolverInputV2Params
): Promise<SolverInputV2> {
  const { storeId, lookbackDays = DEFAULT_LOOKBACK_DAYS, shiftOverrides } = params;
  const targetDate = startOfDay(params.date);

  const shiftOverrideMap = new Map<string, ShiftOverrideDescriptor>();
  if (shiftOverrides && shiftOverrides.length > 0) {
    for (const override of shiftOverrides) {
      if (
        !override ||
        typeof override.shiftStartMin !== 'number' ||
        typeof override.shiftEndMin !== 'number' ||
        override.shiftEndMin <= override.shiftStartMin
      ) {
        continue;
      }
      shiftOverrideMap.set(override.crewId, override);
    }
  }

  const storePromise = prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      timezone: true,
      openMinutesFromMidnight: true,
      closeMinutesFromMidnight: true,
    },
  });
  const rolesPromise = prisma.role.findMany({
    where: { storeId },
    include: {
      RoleFamily: true,
    },
  });
  const roleFamiliesPromise = prisma.roleFamily.findMany({
    where: {
      Role: {
        some: { storeId },
      },
    },
    include: {
      Role: {
        where: { storeId },
        select: { id: true },
      },
    },
  });
  const crewPromise = prisma.crew.findMany({
    where: { storeId },
    include: {
      CrewRole: { select: { roleId: true } },
      Shift: {
        where: { date: targetDate },
        select: { startMin: true, endMin: true },
      },
    },
  });
  const coverageWindowsPromise = prisma.roleCoverageWindow.findMany({
    where: { storeId, date: targetDate },
    select: { roleId: true, startMin: true, endMin: true, crewPerMinute: true, constraintRule: true },
    orderBy: [{ startMin: 'asc' }, { roleId: 'asc' }],
  });
  const crewQuotasPromise = prisma.crewRoleQuota.findMany({
    where: { storeId, date: targetDate },
    select: { roleId: true, crewId: true, startMin: true, endMin: true, requiredMin: true },
    orderBy: [{ crewId: 'asc' }, { roleId: 'asc' }],
  });
  const fairnessTrackersPromise = prisma.roleFairnessTracker.findMany({
    where: { storeId },
    select: { roleId: true, storeId: true, lookbackDays: true, enabled: true },
  });
  const fairnessHistoryPromise = prisma.crewRoleFairnessHistory.findMany({
    where: { storeId },
    select: {
      roleId: true,
      crewId: true,
      storeId: true,
      minutesAssigned: true,
      date: true,
    },
  });

  // NEW: Fetch shift history for fairness normalization (minutes per hour worked)
  // We'll filter by lookback window after we know the max lookback from trackers
  const shiftHistoryPromise = prisma.shift.findMany({
    where: { storeId },
    select: {
      crewId: true,
      date: true,
      startMin: true,
      endMin: true,
    },
  });

  // Fetch role rules: store-level and crew-level
  const roleRulesPromise = prisma.storeRoleRule.findMany({
    where: { storeId },
    select: {
      id: true,
      storeId: true,
      roleRuleId: true,
      valueInt: true,
      isPriority: true,
      createdAt: true,
      updatedAt: true,
      RoleRule: {
        include: {
          Role: { select: { id: true, code: true } },
          TargetRole: { select: { id: true, code: true } },
        },
      },
    },
  });
  const crewRoleRulesPromise = prisma.crewRoleRule.findMany({
    where: {
      Crew: { storeId },
    },
    select: {
      id: true,
      crewId: true,
      roleRuleId: true,
      valueInt: true,
      isPriority: true,
      createdAt: true,
      updatedAt: true,
      RoleRule: {
        include: {
          Role: { select: { id: true, code: true } },
          TargetRole: { select: { id: true, code: true } },
        },
      },
    },
  });

  type FairnessTrackerRecord = Awaited<typeof fairnessTrackersPromise>[number];
  type FairnessHistoryRecord = Awaited<typeof fairnessHistoryPromise>[number];
  type ShiftHistoryRecord = Awaited<typeof shiftHistoryPromise>[number];
  type RoleFamilyRecord = Awaited<typeof roleFamiliesPromise>[number];
  type CoverageWindowRecord = Awaited<typeof coverageWindowsPromise>[number];
  type CrewQuotaRecord = Awaited<typeof crewQuotasPromise>[number];
  type StoreRoleRuleRecord = Awaited<typeof roleRulesPromise>[number];
  type CrewRoleRuleRecord = Awaited<typeof crewRoleRulesPromise>[number];

  const [
    storeRecord,
    roleRecords,
    roleFamilyRecords,
    crewRecords,
    coverageWindowRecords,
    crewQuotaRecords,
    fairnessTrackerRecords,
    fairnessHistoryRecords,
    shiftHistoryRecords,
    storeRoleRuleRecords,
    crewRoleRuleRecords,
  ] = (await Promise.all([
    storePromise,
    rolesPromise,
    roleFamiliesPromise,
    crewPromise,
    coverageWindowsPromise,
    crewQuotasPromise,
    fairnessTrackersPromise,
    fairnessHistoryPromise,
    shiftHistoryPromise,
    roleRulesPromise,
    crewRoleRulesPromise,
  ])) as [
    Awaited<typeof storePromise>,
    Awaited<typeof rolesPromise>,
    Awaited<typeof roleFamiliesPromise>,
    Awaited<typeof crewPromise>,
    Awaited<typeof coverageWindowsPromise>,
    Awaited<typeof crewQuotasPromise>,
    Awaited<typeof fairnessTrackersPromise>,
    Awaited<typeof fairnessHistoryPromise>,
    Awaited<typeof shiftHistoryPromise>,
    Awaited<typeof roleRulesPromise>,
    Awaited<typeof crewRoleRulesPromise>,
  ];

  if (!storeRecord) {
    throw new Error(`Store ${storeId} not found`);
  }

  const fairnessTrackers: RoleFairnessTrackerDescriptor[] = fairnessTrackerRecords.map((record: FairnessTrackerRecord) => ({
    roleId: record.roleId,
    storeId: record.storeId,
    lookbackDays: record.lookbackDays,
    enabled: record.enabled,
  }));
  const fairnessTrackerLookup = new Map<number, RoleFairnessTrackerDescriptor>();
  for (const tracker of fairnessTrackers) {
    fairnessTrackerLookup.set(tracker.roleId, tracker);
  }

  const fairnessHistory: CrewRoleFairnessHistoryDescriptor[] = fairnessHistoryRecords.map((record: FairnessHistoryRecord) => {
    const tracker = fairnessTrackerLookup.get(record.roleId);
    return {
      roleId: record.roleId,
      crewId: record.crewId,
      storeId: record.storeId,
      minutesAssigned: record.minutesAssigned,
      date: record.date,
      lookbackDays: tracker?.lookbackDays ?? 14,  // Default to 14 days if no tracker
    } satisfies CrewRoleFairnessHistoryDescriptor;
  });

  // Build shift history for fairness normalization (minutes per hour worked)
  const shiftHistory: CrewShiftHistoryDescriptor[] = shiftHistoryRecords.map((record: ShiftHistoryRecord) => ({
    crewId: record.crewId,
    date: record.date,
    shiftMinutes: record.endMin - record.startMin,
  }));

  // Build role rules with priority resolution
  // Priority order:
  // 1. CrewRoleRule with isPriority=true → use crew override
  // 2. StoreRoleRule with isPriority=true (no crew priority) → use store default
  // 3. CrewRoleRule exists (no priority flags) → use crew override
  // 4. StoreRoleRule exists (fallback) → use store default
  
  // Helper to create a unique "base" key for a rule.
  // IMPORTANT:
  // - We intentionally do NOT include valueInt here.
  // - valueInt is a parameter of the rule instance, and we want crew overrides
  //   to replace the store rule even when valueInt differs (e.g., MAX_CONSECUTIVE=60 store,
  //   but crew override MAX_CONSECUTIVE=180).
  // - Some rule types can legitimately have multiple instances differing by valueInt
  //   (e.g., CANNOT_ASSIGN_DURING_STORE_HOUR_X), but those should be handled as a set
  //   where crew can override the whole set.
  const ruleBaseKey = (roleId: number, type: string, targetRoleId: number | null) =>
    `${roleId}:${type}:${targetRoleId ?? 'null'}`;

  // Index store-level rules by base key (may be multiple records per base key)
  const storeRulesByBaseKey = new Map<string, StoreRoleRuleRecord[]>();
  for (const storeRule of storeRoleRuleRecords) {
    const rr = storeRule.RoleRule;
    const key = ruleBaseKey(rr.roleId, rr.type, rr.targetRoleId);
    const arr = storeRulesByBaseKey.get(key) ?? [];
    arr.push(storeRule);
    storeRulesByBaseKey.set(key, arr);
  }

  // Index crew-level rules by (crewId, base key) (may be multiple records per base key)
  const crewRulesByCrewAndBaseKey = new Map<string, Map<string, CrewRoleRuleRecord[]>>();
  for (const crewRule of crewRoleRuleRecords) {
    const rr = crewRule.RoleRule;
    const key = ruleBaseKey(rr.roleId, rr.type, rr.targetRoleId);

    if (!crewRulesByCrewAndBaseKey.has(crewRule.crewId)) {
      crewRulesByCrewAndBaseKey.set(crewRule.crewId, new Map());
    }
    const inner = crewRulesByCrewAndBaseKey.get(crewRule.crewId)!;
    const arr = inner.get(key) ?? [];
    arr.push(crewRule);
    inner.set(key, arr);
  }

  // Collect all base keys (union of store and crew base keys)
  const allBaseKeys = new Set<string>();
  for (const key of storeRulesByBaseKey.keys()) allBaseKeys.add(key);
  for (const crewMap of crewRulesByCrewAndBaseKey.values()) {
    for (const key of crewMap.keys()) allBaseKeys.add(key);
  }

  // Get all crew IDs from the crew records
  const ruleCrewIds = crewRecords.map(c => c.id);

  const roleRules: RoleRuleDescriptor[] = [];

  // For each crew, resolve which rules apply.
  // Semantics:
  // - If crew has ANY rules for a base key, we treat that as overriding the store rules
  //   for that base key.
  // - We only emit PRIORITY rules. If crew has priority rules, emit those.
  // - If crew has no priority rules for that base key, emit nothing (i.e. crew provided
  //   non-priority rules are ignored under this strict policy).
  // - If crew has no rules at all for that base key, emit the store priority rules.
  for (const crewId of ruleCrewIds) {
    const crewRulesMap = crewRulesByCrewAndBaseKey.get(crewId);

    for (const baseKey of allBaseKeys) {
      const crewRules = crewRulesMap?.get(baseKey) ?? [];
      const storeRules = storeRulesByBaseKey.get(baseKey) ?? [];

      if (crewRules.length > 0) {
        // Crew overrides store for this base key.
        // Under strict semantics: only use priority crew rules.
        const priorityCrewRules = crewRules.filter((r) => r.isPriority);
        for (const rec of priorityCrewRules) {
          const rr = rec.RoleRule;
          roleRules.push({
            id: rec.id,
            roleRuleId: rr.id,
            roleId: rr.roleId,
            roleCode: rr.Role.code,
            type: rr.type,
            targetRoleId: rr.targetRoleId,
            targetRoleCode: rr.TargetRole?.code ?? null,
            valueInt: rec.valueInt,
            constraintType: rr.constraintType,
            crewId: crewId,
            isPriority: rec.isPriority,
            source: 'crew',
          });
        }
        continue;
      }

      // No crew rules → apply store defaults, but only priority ones
      const priorityStoreRules = storeRules.filter((r) => r.isPriority);
      for (const rec of priorityStoreRules) {
        const rr = rec.RoleRule;
        roleRules.push({
          id: rec.id,
          roleRuleId: rr.id,
          roleId: rr.roleId,
          roleCode: rr.Role.code,
          type: rr.type,
          targetRoleId: rr.targetRoleId,
          targetRoleCode: rr.TargetRole?.code ?? null,
          valueInt: rec.valueInt,
          constraintType: rr.constraintType,
          crewId: crewId,
          isPriority: rec.isPriority,
          source: 'store',
        });
      }
    }
  }

  const store: StoreDescriptor = {
    id: storeRecord.id,
    timezone: storeRecord.timezone,
    openMinutesFromMidnight: storeRecord.openMinutesFromMidnight,
    closeMinutesFromMidnight: storeRecord.closeMinutesFromMidnight,
  };

  // Build role families
  const roleFamilies: RoleFamilyDescriptor[] = roleFamilyRecords.map((family: RoleFamilyRecord) => ({
    id: family.id,
    name: family.name,
    minMinutes: family.minMinutes,
    maxMinutes: family.maxMinutes,
    roleIds: family.Role.map((r: { id: number }) => r.id),
  }));

  const roles: RoleDescriptor[] = roleRecords.map((role) => {
    const assignmentModel: AssignmentModelValue = role.assignmentModel ?? 'WINDOW';

    // NOTE: The DB schema may not have window offset fields yet; keep optional.
    const windowOffsets = undefined;

    const fairnessConfig = fairnessTrackerLookup.get(role.id);

    return {
      id: role.id,
      code: role.code,
      displayName: role.displayName,
      assignmentModel,
      taskLength: role.taskLength,
      // Not currently present on Role schema; default false.
      canSplitForGaps: false,
      familyId: role.familyId,
      allowOutsideStoreHours: role.allowOutsideStoreHours,
      consecutivePolicy: role.consecutivePolicy ?? 'NONE',
      // Not currently present on Role schema.
      minShiftLengthForRoleAccess: null,
      windowOffsets,
      ...(fairnessConfig
        ? {
            fairnessTracking: {
              lookbackDays: fairnessConfig.lookbackDays,
              enabled: fairnessConfig.enabled,
            },
          }
        : {}),
    } satisfies RoleDescriptor;
  });

  const roleLookup = new Map<number, RoleDescriptor>();
  for (const role of roles) {
    roleLookup.set(role.id, role);
  }

  const crew: CrewDescriptor[] = crewRecords
    .filter((crew) => crew.Shift.length > 0 || shiftOverrideMap.has(crew.id))
    .map((crew) => {
      const override = shiftOverrideMap.get(crew.id);
      let shiftStartMin: number | null = null;
      let shiftEndMin: number | null = null;

      if (override) {
        shiftStartMin = override.shiftStartMin;
        shiftEndMin = override.shiftEndMin;
      } else if (crew.Shift.length > 0) {
        const shift = crew.Shift.reduce((earliest, current) =>
          current.startMin < earliest.startMin ? current : earliest
        );
        shiftStartMin = shift.startMin;
        shiftEndMin = shift.endMin;
      }

      if (shiftStartMin === null || shiftEndMin === null) {
        throw new Error(`Crew ${crew.id} is missing shift data for solver input`);
      }

      return {
        id: crew.id,
        name: crew.name,
        roleIds: crew.CrewRole.map((cr) => cr.roleId),
        shiftStartMin,
        shiftEndMin,
      } satisfies CrewDescriptor;
    });

  // Build coverage windows (replaces hourly + window constraints)
  const coverageWindows: CoverageWindowDescriptor[] = coverageWindowRecords.map((record: CoverageWindowRecord) => ({
    roleId: record.roleId,
    startMin: record.startMin,
    endMin: record.endMin,
    crewPerMinute: record.crewPerMinute,
    constraintRule: record.constraintRule,
  }));

  // Build crew quotas (replaces daily constraints)
  const crewQuotas: CrewQuotaDescriptor[] = crewQuotaRecords.map((record: CrewQuotaRecord) => ({
    roleId: record.roleId,
    crewId: record.crewId,
    startMin: record.startMin,
    endMin: record.endMin,
    requiredMin: record.requiredMin,
  }));

  // Legacy preference system removed - now using CrewRoleRule for preferences
  const preferences: PreferenceDescriptor[] = [];
  const bankedPreferences: BankedPreferenceDescriptor[] = [];

  return {
    store,
    roleFamilies,
    roles,
    crew,
    coverageWindows,
    crewQuotas,
    preferences,
    bankedPreferences,
    fairnessTrackers,
    fairnessHistory,
    shiftHistory,
    roleRules,
  } satisfies SolverInputV2;
}

// Legacy preference boost functions removed
