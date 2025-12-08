import { AssignmentModel, BankingStatus, ConsecutivePolicy } from '@prisma/client';
import { PreferenceType } from '@logbook-writer/shared-types';

export type AssignmentModelValue = AssignmentModel | 'SOLVER';

export interface StoreDescriptor {
  id: number;
  timezone: string;
  baseSlotMinutes: number;
  openMinutesFromMidnight: number;
  closeMinutesFromMidnight: number;
}

export interface RoleDescriptor {
  id: number;
  code: string;
  displayName: string;
  assignmentModels: AssignmentModelValue[];
  minSlots: number;
  maxSlots: number;
  blockSize: number;
  allowOutsideStoreHours: boolean;
  consecutivePolicy: ConsecutivePolicy;
  minShiftLengthForRoleAccess?: number | null;
  windowOffsets?: {
    startOffsetMin: number;
    endOffsetMin: number;
  };
  fairnessTracking?: {
    lookbackDays: number;
    enabled: boolean;
  };
}

export interface CrewDescriptor {
  id: string;
  name: string;
  roleIds: number[];
  shiftStartMin: number;
  shiftEndMin: number;
}

export interface HourlyRequirementDescriptor {
  roleId: number;
  hour: number;
  required: number;
}

export interface WindowRequirementDescriptor {
  roleId: number;
  startHour: number;
  endHour: number;
  requiredPerHour: number;
}

export interface DailyRequirementDescriptor {
  roleId: number;
  crewId: string;
  requiredMinutes: number;
}

export interface PreferenceDescriptor {
  crewId: string;
  roleId: number | null;
  preferenceType: PreferenceType;
  baseWeight: number;
  crewWeight: number;
  adaptiveBoost: number;
  intValue?: number;
  rolePreferenceId: number;
  assignmentModels: AssignmentModelValue[];
  bankedWeightBoost?: number;
  bankingMetadata?: PreferenceBankingMetadata;
}

export interface PreferenceBankingMetadata {
  bankedPreferenceId: number;
  weight: number;
  ageDays: number;
  expiresAt: Date;
  boostMultiplier: number;
  status: BankingStatus;
}

export interface BankedPreferenceDescriptor {
  id: number;
  crewId: string;
  rolePreferenceId: number;
  status: BankingStatus;
  weight: number;
  originalDate: Date;
  expiresAt: Date;
  ageDays: number;
  boostMultiplier: number;
  preferenceType: PreferenceType;
  preferenceValue: string;
  storeId: number;
}

export interface RoleFairnessTrackerDescriptor {
  roleId: number;
  storeId: number;
  lookbackDays: number;
  enabled: boolean;
}

export interface CrewRoleFairnessHistoryDescriptor {
  roleId: number;
  crewId: string;
  storeId: number;
  minutesAssigned: number;
  windowStart: Date;
  windowEnd: Date;
  lookbackDays: number;
}

export interface SolverInputV2 {
  store: StoreDescriptor;
  roles: RoleDescriptor[];
  crew: CrewDescriptor[];
  hourlyRequirements: HourlyRequirementDescriptor[];
  windowRequirements: WindowRequirementDescriptor[];
  dailyRequirements: DailyRequirementDescriptor[];
  preferences: PreferenceDescriptor[];
  bankedPreferences: BankedPreferenceDescriptor[];
  fairnessTrackers: RoleFairnessTrackerDescriptor[];
  fairnessHistory: CrewRoleFairnessHistoryDescriptor[];
}
