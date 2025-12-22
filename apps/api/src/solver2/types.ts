import { AssignmentModel, BankingStatus, ConsecutivePolicy, RoleRuleType, ConstraintType } from '@prisma/client';
import { PreferenceType } from '@logbook-writer/shared-types';

export type AssignmentModelValue = AssignmentModel | 'SOLVER';

export interface StoreDescriptor {
  id: number;
  timezone: string;
  openMinutesFromMidnight: number;
  closeMinutesFromMidnight: number;
}

// NEW: Role family for aggregate time constraints
export interface RoleFamilyDescriptor {
  id: number;
  name: string;
  minMinutes: number;
  maxMinutes: number;
  roleIds: number[]; // roles in this family
}

export interface RoleDescriptor {
  id: number;
  code: string;
  displayName: string;
  assignmentModel: AssignmentModelValue; // single value - for UI display only, solver ignores this
  taskLength: number; // assignment duration in minutes
  canSplitForGaps: boolean; // can be split into smaller chunks to fill gaps
  familyId: number; // link to RoleFamily
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

// NEW: Replaces HourlyRequirementDescriptor + WindowRequirementDescriptor
export interface CoverageWindowDescriptor {
  roleId: number;
  startMin: number; // minutes from midnight
  endMin: number; // minutes from midnight
  crewPerMinute: number; // how many crew should be assigned
  constraintRule: 'MIN' | 'MAX' | 'EXACTLY'; // MIN/MAX/EXACTLY N crew
}

// NEW: Replaces DailyRequirementDescriptor
export interface CrewQuotaDescriptor {
  roleId: number;
  crewId: string;
  startMin: number; // time window start
  endMin: number; // time window end
  requiredMin: number; // minutes required
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
  assignmentModel: AssignmentModelValue; // changed from assignmentModels[]
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

// NEW: Role rules for solver constraints
export interface RoleRuleDescriptor {
  id: number;  // CrewRoleRule.id or StoreRoleRule.id (unique per crew-rule combination)
  roleRuleId: number;  // RoleRule.id (the template rule)
  roleId: number;
  roleCode: string; // for debugging
  type: RoleRuleType;
  targetRoleId: number | null;
  targetRoleCode: string | null; // for debugging
  valueInt: number | null;
  constraintType: ConstraintType;
  // Scope: if crewId is set, applies only to that crew; otherwise store-wide
  crewId: string | null;
  isPriority: boolean;
  source: 'store' | 'crew';  // Whether this came from StoreRoleRule or CrewRoleRule
}

export interface SolverInputV2 {
  store: StoreDescriptor;
  roleFamilies: RoleFamilyDescriptor[];
  roles: RoleDescriptor[];
  crew: CrewDescriptor[];
  coverageWindows: CoverageWindowDescriptor[];
  crewQuotas: CrewQuotaDescriptor[];
  preferences: PreferenceDescriptor[];
  bankedPreferences: BankedPreferenceDescriptor[];
  fairnessTrackers: RoleFairnessTrackerDescriptor[];
  fairnessHistory: CrewRoleFairnessHistoryDescriptor[];
  roleRules: RoleRuleDescriptor[];
}
