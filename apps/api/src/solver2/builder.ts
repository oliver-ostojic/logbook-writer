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
  RoleRuleDescriptor,
} from './types';
import type { PreferenceType } from '@logbook-writer/shared-types';
import { resolvePreferenceAssignmentModel } from './preference-assignment-models';

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
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const positiveOr = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;
const nonNegativeOr = (value: number, fallback: number) =>
  Number.isFinite(value) && value >= 0 ? value : fallback;

const BANKING_WEIGHT_DIVISOR = positiveOr(parseFloat(process.env.BANKING_WEIGHT_DIVISOR ?? '10'), 10);
const BANKING_MAX_WEIGHT_BOOST = positiveOr(parseFloat(process.env.BANKING_MAX_WEIGHT_BOOST ?? '3'), 3);
const BANKING_AGE_BOOST_FACTOR = nonNegativeOr(
  parseFloat(process.env.BANKING_AGE_BOOST_FACTOR ?? '0.5'),
  0.5
);
const BANKING_CARRYOVER_DAYS = positiveOr(parseFloat(process.env.BANKING_CARRYOVER_DAYS ?? '30'), 30);

type CrewPreferenceRecordWithRole = {
  crewId: string;
  crewWeight: number;
  intValue: number | null;
  RolePreference: {
    id: number;
    roleId: number | null;
    preferenceType: PreferenceType;
    baseWeight: number;
  };
};

type RawBankedPreferenceRecord = {
  id: number;
  crewId: string;
  rolePreferenceId: number;
  weight: number;
  originalDate: Date;
  expiresAt: Date;
  status: BankedPreferenceDescriptor['status'];
  preferenceType: PreferenceType;
  preferenceValue: string;
  storeId: number;
};

export async function buildSolverInputV2(
  params: BuildSolverInputV2Params
): Promise<SolverInputV2> {
  const { storeId, lookbackDays = DEFAULT_LOOKBACK_DAYS, shiftOverrides } = params;
  const targetDate = normalizeDate(params.date);

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
      windowStart: true,
      windowEnd: true,
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
    const windowDurationDays = Math.max(
      1,
      Math.round((record.windowEnd.getTime() - record.windowStart.getTime()) / MS_PER_DAY)
    );
    return {
      roleId: record.roleId,
      crewId: record.crewId,
      storeId: record.storeId,
      minutesAssigned: record.minutesAssigned,
      windowStart: record.windowStart,
      windowEnd: record.windowEnd,
      lookbackDays: tracker?.lookbackDays ?? windowDurationDays,
    } satisfies CrewRoleFairnessHistoryDescriptor;
  });

  // Build role rules with priority resolution
  // Priority order:
  // 1. CrewRoleRule with isPriority=true → use crew override
  // 2. StoreRoleRule with isPriority=true (no crew priority) → use store default
  // 3. CrewRoleRule exists (no priority flags) → use crew override
  // 4. StoreRoleRule exists (fallback) → use store default
  
  // Helper to create a unique key for a rule
  // NOTE: We include valueInt because rules like CANNOT_ASSIGN_DURING_STORE_HOUR_X
  // can have multiple entries with different valueInt (different hours)
  const ruleKey = (roleId: number, type: string, targetRoleId: number | null, valueInt: number | null) =>
    `${roleId}:${type}:${targetRoleId ?? 'null'}:${valueInt ?? 'null'}`;

  // Index store-level rules by unique key
  const storeRulesByKey = new Map<string, StoreRoleRuleRecord>();
  for (const storeRule of storeRoleRuleRecords) {
    const rr = storeRule.RoleRule;
    const key = ruleKey(rr.roleId, rr.type, rr.targetRoleId, storeRule.valueInt);
    storeRulesByKey.set(key, storeRule);
  }

  // Index crew-level rules by (crewId, key)
  const crewRulesByCrewAndKey = new Map<string, Map<string, CrewRoleRuleRecord>>();
  for (const crewRule of crewRoleRuleRecords) {
    const rr = crewRule.RoleRule;
    const key = ruleKey(rr.roleId, rr.type, rr.targetRoleId, crewRule.valueInt);
    
    if (!crewRulesByCrewAndKey.has(crewRule.crewId)) {
      crewRulesByCrewAndKey.set(crewRule.crewId, new Map());
    }
    crewRulesByCrewAndKey.get(crewRule.crewId)!.set(key, crewRule);
  }

  // Collect all unique rule keys (union of store and crew keys)
  const allRuleKeys = new Set<string>();
  for (const key of storeRulesByKey.keys()) allRuleKeys.add(key);
  for (const crewMap of crewRulesByCrewAndKey.values()) {
    for (const key of crewMap.keys()) allRuleKeys.add(key);
  }

  // Get all crew IDs from the crew records
  const ruleCrewIds = crewRecords.map(c => c.id);

  const roleRules: RoleRuleDescriptor[] = [];

  // For each crew, resolve which rules apply
  for (const crewId of ruleCrewIds) {
    const crewRulesMap = crewRulesByCrewAndKey.get(crewId);

    for (const key of allRuleKeys) {
      const storeRule = storeRulesByKey.get(key);
      const crewRule = crewRulesMap?.get(key);

      // Determine which rule wins based on priority
      let winningRule: { source: 'store' | 'crew'; record: StoreRoleRuleRecord | CrewRoleRuleRecord } | null = null;

      if (crewRule?.isPriority) {
        // Crew has priority override
        winningRule = { source: 'crew', record: crewRule };
      } else if (storeRule?.isPriority && !crewRule) {
        // Store has priority and crew has no rule
        winningRule = { source: 'store', record: storeRule };
      } else if (storeRule?.isPriority && crewRule && !crewRule.isPriority) {
        // Store has priority, crew has rule but no priority → store wins
        winningRule = { source: 'store', record: storeRule };
      } else if (crewRule) {
        // Crew has rule (no priority flags in play)
        winningRule = { source: 'crew', record: crewRule };
      } else if (storeRule) {
        // Fallback to store rule
        winningRule = { source: 'store', record: storeRule };
      }

      if (winningRule) {
        const rr = winningRule.record.RoleRule;
        roleRules.push({
          id: rr.id,
          roleId: rr.roleId,
          roleCode: rr.Role.code,
          type: rr.type,
          targetRoleId: rr.targetRoleId,
          targetRoleCode: rr.TargetRole?.code ?? null,
          valueInt: winningRule.record.valueInt,
          constraintType: rr.constraintType,
          crewId: crewId, // Always crew-specific now
          isPriority: winningRule.record.isPriority,
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

  const crewIds = crew.map((c) => c.id);
  let preferenceRecords: CrewPreferenceRecordWithRole[] = [];
  let bankedPreferenceRecords: RawBankedPreferenceRecord[] = [];
  if (crewIds.length) {
    const [preferenceRecordsRaw, bankedPreferenceRecordsRaw] = await Promise.all([
      prisma.crewPreference.findMany({
        where: {
          crewId: { in: crewIds },
          enabled: true,
        },
        include: {
          RolePreference: {
            select: {
              id: true,
              roleId: true,
              preferenceType: true,
              baseWeight: true,
            },
          },
        },
      }) as unknown as Promise<CrewPreferenceRecordWithRole[]>,
      (prisma.bankedPreference.findMany({
        where: {
          crewId: { in: crewIds },
          storeId,
          status: 'ACTIVE',
        },
      }) as unknown as Promise<RawBankedPreferenceRecord[]>),
    ]);
    preferenceRecords = preferenceRecordsRaw;
    bankedPreferenceRecords = bankedPreferenceRecordsRaw;
  }

  const bankedPreferences = buildBankedPreferenceDescriptors(bankedPreferenceRecords, targetDate);
  const bankedPreferenceLookup = new Map<string, BankedPreferenceDescriptor>();
  for (const descriptor of bankedPreferences) {
    bankedPreferenceLookup.set(
      preferenceMapKey(descriptor.crewId, descriptor.rolePreferenceId),
      descriptor
    );
  }

  const preferences: PreferenceDescriptor[] = await Promise.all(
    preferenceRecords.map(async (record) => {
      const adaptiveBoost = await calculateAdaptiveBoost(
        record.crewId,
        record.RolePreference.id,
        lookbackDays,
        targetDate
      );

      const assignmentModel = resolvePreferenceAssignmentModel(
        record.RolePreference.roleId,
        roleLookup
      );

      if (assignmentModel === null) {
        throw new Error(`Role ${record.RolePreference.roleId} not found for preference`);
      }

      const credit = bankedPreferenceLookup.get(
        preferenceMapKey(record.crewId, record.RolePreference.id)
      );

      const descriptor: PreferenceDescriptor = {
        crewId: record.crewId,
        roleId: record.RolePreference.roleId,
        preferenceType: record.RolePreference.preferenceType as PreferenceType,
        baseWeight: record.RolePreference.baseWeight,
        crewWeight: record.crewWeight,
        adaptiveBoost,
        intValue: record.intValue ?? undefined,
        rolePreferenceId: record.RolePreference.id,
        assignmentModel,
      } satisfies PreferenceDescriptor;

      if (credit) {
        descriptor.bankedWeightBoost = credit.boostMultiplier;
        descriptor.bankingMetadata = {
          bankedPreferenceId: credit.id,
          weight: credit.weight,
          ageDays: credit.ageDays,
          expiresAt: credit.expiresAt,
          boostMultiplier: credit.boostMultiplier,
          status: credit.status,
        };
      }

      return descriptor;
    })
  );

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
    roleRules,
  } satisfies SolverInputV2;
}

async function calculateAdaptiveBoost(
  crewId: string,
  rolePreferenceId: number,
  lookbackDays: number,
  currentDate: Date
): Promise<number> {
  const lookbackDate = new Date(currentDate);
  lookbackDate.setDate(lookbackDate.getDate() - Math.max(lookbackDays, 1));

  const history = await prisma.preferenceSatisfaction.findMany({
    where: {
      crewId,
      rolePreferenceId,
      date: {
        gte: lookbackDate,
        lt: currentDate,
      },
    },
    select: { met: true },
  });

  if (history.length === 0) {
    return 1.0;
  }

  const metCount = history.filter((entry) => entry.met).length;
  const satisfactionRate = metCount / history.length;
  const BOOST_MULTIPLIER = 2.0;
  const boost = 1.0 + (1.0 - satisfactionRate) * BOOST_MULTIPLIER;
  return Math.max(1.0, Math.min(3.0, boost));
}

function normalizeDate(input: string | Date): Date {
  const date = typeof input === 'string' ? new Date(input) : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date provided: ${input}`);
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function preferenceMapKey(crewId: string, rolePreferenceId: number): string {
  return `${crewId}:${rolePreferenceId}`;
}

function buildBankedPreferenceDescriptors(
  records: RawBankedPreferenceRecord[],
  targetDate: Date
): BankedPreferenceDescriptor[] {
  return records.map((record) => {
    const { boostMultiplier, ageDays } = computeBankedBoost(record.originalDate, record.weight, targetDate);
    return {
      id: record.id,
      crewId: record.crewId,
      rolePreferenceId: record.rolePreferenceId,
      status: record.status,
      weight: record.weight,
      originalDate: record.originalDate,
      expiresAt: record.expiresAt,
      ageDays,
      boostMultiplier,
      preferenceType: record.preferenceType,
      preferenceValue: record.preferenceValue,
      storeId: record.storeId,
    } satisfies BankedPreferenceDescriptor;
  });
}

function computeBankedBoost(
  originalDate: Date,
  weight: number,
  targetDate: Date
): { boostMultiplier: number; ageDays: number } {
  const ageDays = Math.max(0, Math.floor((targetDate.getTime() - originalDate.getTime()) / MS_PER_DAY));
  const divisor = BANKING_WEIGHT_DIVISOR || 1;
  const carryover = BANKING_CARRYOVER_DAYS || 1;
  const weightFactor = 1 + Math.max(0, weight) / divisor;
  const normalizedAge = Math.min(ageDays / carryover, 1);
  const ageFactor = 1 + normalizedAge * BANKING_AGE_BOOST_FACTOR;
  const boostMultiplier = Math.min(BANKING_MAX_WEIGHT_BOOST, weightFactor * ageFactor);
  return { boostMultiplier, ageDays };
}
