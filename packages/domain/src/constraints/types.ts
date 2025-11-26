/**
 * Constraint validation and scoring types
 */

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

export interface ScoreResult {
  score: number;
  details?: string;
}

/**
 * Assignment in solver context (simplified from database model)
 */
export interface SolverAssignment {
  crewId: string;
  roleId: number;
  startMinutes: number; // minutes from midnight
  endMinutes: number;   // minutes from midnight
}

/**
 * Store configuration for solver
 */
export interface StoreConfig {
  baseSlotMinutes: number;
  openMinutesFromMidnight: number;
  closeMinutesFromMidnight: number;
  reqShiftLengthForBreak: number;
  breakWindowStart: number;
  breakWindowEnd: number;
}

/**
 * Role configuration for solver
 */
export interface RoleConfig {
  id: number;
  code: string;
  minSlots: number;
  maxSlots: number;
  blockSize: number; // assignments must be multiples of this many slots
  slotsMustBeConsecutive: boolean;
  allowOutsideStoreHours: boolean;
}

/**
 * Crew configuration for solver
 */
export interface CrewConfig {
  id: string;
  name: string;
  cachedShiftStartMin: number;
  cachedShiftEndMin: number;
  qualifiedRoleIds: number[]; // from CrewRole
}

/**
 * Preference for scoring
 */
export interface PreferenceConfig {
  crewId: string;
  roleId: number | null;
  preferenceType: 'FIRST_HOUR' | 'FAVORITE' | 'TIMING' | 'CONSECUTIVE';
  baseWeight: number;
  crewWeight: number;
  intValue?: number; // for TIMING (-1 earlier, +1 later)
  adaptiveBoost: number;
}
