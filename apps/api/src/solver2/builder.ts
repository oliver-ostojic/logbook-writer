import { PrismaClient } from '@prisma/client';
import type {
  SolverInputV2,
  StoreDescriptor,
  RoleDescriptor,
  CrewDescriptor,
  HourlyRequirementDescriptor,
  WindowRequirementDescriptor,
  DailyRequirementDescriptor,
  PreferenceDescriptor,
  AssignmentModelValue,
  BankedPreferenceDescriptor,
  RoleFairnessTrackerDescriptor,
  CrewRoleFairnessHistoryDescriptor,
} from './types';
import type { PreferenceType } from '@logbook-writer/shared-types';
import { resolvePreferenceAssignmentModels } from './preference-assignment-models';

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
  rolePreference: {
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
      baseSlotMinutes: true,
      openMinutesFromMidnight: true,
      closeMinutesFromMidnight: true,
    },
  });
  const rolesPromise = prisma.role.findMany({
    where: { storeId },
  });
  const crewPromise = prisma.crew.findMany({
    where: { storeId },
    include: {
      crewRoles: { select: { roleId: true } },
      shifts: {
        where: { date: targetDate },
        select: { startMin: true, endMin: true },
      },
    },
  });
  const hourlyConstraintsPromise = prisma.hourlyRoleConstraint.findMany({
    where: { storeId, date: targetDate },
    select: { roleId: true, hour: true, requiredPerHour: true },
    orderBy: [{ hour: 'asc' }, { roleId: 'asc' }],
  });
  const windowConstraintsPromise = prisma.windowRoleConstraint.findMany({
    where: { storeId, date: targetDate },
    select: { roleId: true, startHour: true, endHour: true, requiredPerHour: true },
    orderBy: [{ roleId: 'asc' }],
  });
  const dailyConstraintsPromise = prisma.dailyRoleConstraint.findMany({
    where: { storeId, date: targetDate },
    select: { roleId: true, crewId: true, requiredHours: true },
    orderBy: [{ crewId: 'asc' }],
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

  type FairnessTrackerRecord = Awaited<typeof fairnessTrackersPromise>[number];
  type FairnessHistoryRecord = Awaited<typeof fairnessHistoryPromise>[number];

  const [
    storeRecord,
    roleRecords,
    crewRecords,
    hourlyConstraints,
    windowConstraints,
    dailyConstraints,
    fairnessTrackerRecords,
    fairnessHistoryRecords,
  ] = (await Promise.all([
    storePromise,
    rolesPromise,
    crewPromise,
    hourlyConstraintsPromise,
    windowConstraintsPromise,
    dailyConstraintsPromise,
    fairnessTrackersPromise,
    fairnessHistoryPromise,
  ])) as [
    Awaited<typeof storePromise>,
    Awaited<typeof rolesPromise>,
    Awaited<typeof crewPromise>,
    Awaited<typeof hourlyConstraintsPromise>,
    Awaited<typeof windowConstraintsPromise>,
    Awaited<typeof dailyConstraintsPromise>,
    Awaited<typeof fairnessTrackersPromise>,
    Awaited<typeof fairnessHistoryPromise>,
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

  const store: StoreDescriptor = {
    id: storeRecord.id,
    timezone: storeRecord.timezone,
    baseSlotMinutes: storeRecord.baseSlotMinutes,
    openMinutesFromMidnight: storeRecord.openMinutesFromMidnight,
    closeMinutesFromMidnight: storeRecord.closeMinutesFromMidnight,
  };

  const roles: RoleDescriptor[] = roleRecords.map((role) => {
    const assignmentModels: AssignmentModelValue[] = (role.assignmentModel?.length
      ? role.assignmentModel
      : ['HOURLY']) as AssignmentModelValue[];

  const windowStartOffsetMin = (role as any).windowStartOffsetMin ?? null;
  const windowEndOffsetMin = (role as any).windowEndOffsetMin ?? null;
  const minShiftLengthForRoleAccess = (role as any).minShiftLengthForRoleAccess ?? null;
    const windowOffsets =
      windowStartOffsetMin !== null && windowEndOffsetMin !== null
        ? {
            startOffsetMin: windowStartOffsetMin,
            endOffsetMin: windowEndOffsetMin,
          }
        : undefined;

    const fairnessConfig = fairnessTrackerLookup.get(role.id);

    return {
      id: role.id,
      code: role.code,
      displayName: role.displayName,
      assignmentModels,
      minSlots: role.minSlots,
      maxSlots: role.maxSlots,
      blockSize: role.blockSize,
      allowOutsideStoreHours: role.allowOutsideStoreHours,
  consecutivePolicy: role.consecutivePolicy,
      minShiftLengthForRoleAccess,
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
    .filter((crew) => crew.shifts.length > 0 || shiftOverrideMap.has(crew.id))
    .map((crew) => {
      const override = shiftOverrideMap.get(crew.id);
      let shiftStartMin: number | null = null;
      let shiftEndMin: number | null = null;

      if (override) {
        shiftStartMin = override.shiftStartMin;
        shiftEndMin = override.shiftEndMin;
      } else if (crew.shifts.length > 0) {
        const shift = crew.shifts.reduce((earliest, current) =>
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
        roleIds: crew.crewRoles.map((cr) => cr.roleId),
        shiftStartMin,
        shiftEndMin,
      } satisfies CrewDescriptor;
    });

  const hourlyRequirements: HourlyRequirementDescriptor[] = hourlyConstraints.map((constraint) => ({
    roleId: constraint.roleId,
    hour: constraint.hour,
    required: constraint.requiredPerHour,
  }));

  const windowRequirements: WindowRequirementDescriptor[] = windowConstraints.map((constraint) => ({
    roleId: constraint.roleId,
    startHour: constraint.startHour,
    endHour: constraint.endHour,
    requiredPerHour: constraint.requiredPerHour,
  }));

  const dailyRequirements: DailyRequirementDescriptor[] = dailyConstraints.map((constraint) => ({
    roleId: constraint.roleId,
    crewId: constraint.crewId,
    requiredMinutes: Math.round(constraint.requiredHours * 60),
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
          rolePreference: {
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
        record.rolePreference.id,
        lookbackDays,
        targetDate
      );

      const assignmentModels = resolvePreferenceAssignmentModels(
        record.rolePreference.roleId,
        roleLookup
      );

      const credit = bankedPreferenceLookup.get(
        preferenceMapKey(record.crewId, record.rolePreference.id)
      );

      const descriptor: PreferenceDescriptor = {
        crewId: record.crewId,
        roleId: record.rolePreference.roleId,
        preferenceType: record.rolePreference.preferenceType as PreferenceType,
        baseWeight: record.rolePreference.baseWeight,
        crewWeight: record.crewWeight,
        adaptiveBoost,
        intValue: record.intValue ?? undefined,
        rolePreferenceId: record.rolePreference.id,
        assignmentModels,
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
    roles,
    crew,
    hourlyRequirements,
    windowRequirements,
    dailyRequirements,
    preferences,
    bankedPreferences,
    fairnessTrackers,
    fairnessHistory,
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
