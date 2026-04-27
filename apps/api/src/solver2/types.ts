import { AssignmentModel, ConsecutivePolicy, RoleRuleType, ConstraintType } from '@prisma/client';

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
  date: Date;  // Date of this record (one record per crew/role/day)
  lookbackDays: number;
}

// NEW: Shift history for fairness normalization (minutes per hour worked)
export interface CrewShiftHistoryDescriptor {
  crewId: string;
  date: Date;
  shiftMinutes: number;  // endMin - startMin
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

export interface SolverSettings {
  fairnessBoost?: number;    // Reward for assigning under-represented crew (soft)
  fairnessPenalty?: number;  // Penalty for assigning over-represented crew (soft)
  fairnessMinStd?: number;   // Min std dev to apply fairness (default: 60)
  enableHardFairness?: boolean;  // If true, only allow crew at/near minimum min/hr
  fairnessAllowanceMph?: number; // How much above minimum min/hr is allowed (default: 1.0 min/hr)
  fairnessBaseBoost?: number;   // Magnitude of fairness boost in objective (default: 10000)
  fairnessDebug?: boolean;      // If true, prints audit table to stderr for tracked roles
  intraDayBlockSpreadPenalty?: number;  // Penalty per extra block (>1) of a tracked role assigned to the same crew today (default: 2000, set 0 to disable)
  assignmentReward?: number;
  halfSizePenalty?: number;
  consecutiveBonus?: number;
  hourAlignedBonus?: number;
}

export interface SolverInputV2 {
  store: StoreDescriptor;
  roleFamilies: RoleFamilyDescriptor[];
  roles: RoleDescriptor[];
  crew: CrewDescriptor[];
  coverageWindows: CoverageWindowDescriptor[];
  crewQuotas: CrewQuotaDescriptor[];
  fairnessTrackers: RoleFairnessTrackerDescriptor[];
  fairnessHistory: CrewRoleFairnessHistoryDescriptor[];
  shiftHistory: CrewShiftHistoryDescriptor[];  // NEW: for minutes per hour worked calculation
  roleRules: RoleRuleDescriptor[];
  skipFairnessWeights?: boolean;  // If true, skips fairness boost/penalty in objective (for A/B testing)
  settings?: SolverSettings;  // Tunable parameters
}
