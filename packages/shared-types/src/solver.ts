/**
 * TypeScript DTOs for the MILP Logbook Solver
 * 
 * This file defines the input and output structures for the daily logbook
 * scheduling solver using Mixed-Integer Linear Programming (MILP).
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export enum TaskType {
  REGISTER = 'REGISTER',
  PRODUCT = 'PRODUCT',
  PARKING_HELM = 'PARKING_HELM',
  ORDER_WRITER = 'ORDER_WRITER',
  ART = 'ART',
  BREAK = 'BREAK',
  MEAL_BREAK = 'MEAL_BREAK',
  TRUCK = 'TRUCK',
  DEMO = 'DEMO',
  WINE_DEMO = 'WINE_DEMO',
}

export enum SolverStatus {
  OPTIMAL = 'OPTIMAL',
  FEASIBLE = 'FEASIBLE',
  INFEASIBLE = 'INFEASIBLE',
  TIME_LIMIT = 'TIME_LIMIT',
  ERROR = 'ERROR',
}

// ============================================================================
// SOLVER INPUT
// ============================================================================

/**
 * Crew member information for the solver
 */
export interface SolverCrewMember {
  /** Crew member ID (7-char) */
  id: string;
  
  /** Crew member name */
  name: string;
  
  /** Shift start time in minutes since midnight (e.g., 480 = 8:00 AM) */
  shiftStartMin: number;
  
  /** Shift end time in minutes since midnight (e.g., 1020 = 5:00 PM) */
  shiftEndMin: number;
  
  /** List of role/task types this crew member is eligible for */
  eligibleRoles: TaskType[];
  
  /** Can this crew member take a break? */
  canBreak: boolean;
  
  /** Can this crew member do parking helms? */
  canParkingHelms: boolean;

  /** Minimum hours this crew must spend on REGISTER (daily) - LEGACY FIELD */
  minRegisterHours?: number;

  /** Maximum hours this crew can spend on REGISTER (daily) - LEGACY FIELD */
  maxRegisterHours?: number;
}

/**
 * Per-hour staffing requirements
 */
export interface HourlyStaffingRequirement {
  /** Hour of the day (0-23) */
  hour: number;
  
  /** Required number of crew on REGISTER (exact) */
  requiredRegister: number;
  
  /** Required number of crew on PRODUCT (exact) */
  requiredProduct: number;
  
  /** Required number of crew on PARKING_HELM (exact) */
  requiredParkingHelm: number;
  
  /** Additional role requirements (e.g., DEMO, WINE_DEMO, ART) */
  additionalRequirements?: Array<{
    role: TaskType;
    required: number;
  }>;
}

/**
 * Per-crew required hours for specific roles
 */
export interface CrewRoleRequirement {
  /** Crew member ID */
  crewId: string;
  
  /** Role/task type */
  role: TaskType;
  
  /** Required hours on this role (exact) */
  requiredHours: number;
}

/**
 * Coverage window (DEMO/WINE_DEMO)
 */
export interface CoverageWindow {
  /** Role type (DEMO or WINE_DEMO) */
  role: TaskType;
  
  /** Window start hour (0-23) */
  startHour: number;
  
  /** Window end hour (0-23) */
  endHour: number;
  
  /** Required crew per hour within the window */
  requiredPerHour: number;
}

/**
 * Preference type for scoring crew satisfaction
 */
export enum PreferenceType {
  FIRST_HOUR = 'FIRST_HOUR',
  FAVORITE = 'FAVORITE',
  CONSECUTIVE = 'CONSECUTIVE',
  TIMING = 'TIMING',
}

/**
 * Crew preference configuration for objective function
 * 
 * Represents a single preference that can be satisfied/scored.
 * Multiple preferences can exist for the same crew.
 */
export interface PreferenceConfig {
  /** Crew member ID */
  crewId: string;
  
  /** Role this preference applies to (null = any role for this preference type) */
  role: TaskType | null;
  
  /** Type of preference */
  preferenceType: PreferenceType;
  
  /** Base weight from role preference (store-level default) */
  baseWeight: number;
  
  /** Crew-specific weight multiplier (0.0-5.0, typically 0.5, 1.0, 2.0) */
  crewWeight: number;
  
  /** Dynamic adaptive boost based on historical satisfaction (default 1.0) */
  adaptiveBoost: number;
  
  /** Optional integer value for preferences needing it (e.g., TIMING: -1 early, +1 late) */
  intValue?: number;
}

/**
 * Store-level constraints
 */
export interface StoreConstraints {
  /** Store ID */
  storeId: number;

  /** Solver slot size in minutes */
  baseSlotMinutes: number;

  /** Store open/close minutes from midnight */
  openMinutesFromMidnight: number;
  closeMinutesFromMidnight: number;

  /** Register staffing window override */
  startRegHour: number;
  endRegHour: number;

  /** Break policy */
  reqShiftLengthForBreak: number;
  breakWindowStart: number;
  breakWindowEnd: number;
}

/**
 * Role metadata for solver (assignment mode, consecutive flags)
 */
export interface RoleMetadata {
  /** Role name */
  role: TaskType;

  /** Assignment model communicated to solver */
  assignmentModel: 'HOURLY' | 'HOURLY_WINDOW' | 'DAILY';

  /** Scheduling knobs */
  allowOutsideStoreHours?: boolean;
  slotsMustBeConsecutive?: boolean;
  minSlots?: number;
  maxSlots?: number;
  blockSize?: number;  // Assignment increment (1=any, 2=2-slot blocks, 4=4-slot blocks, etc.)

  /** Behavioral flags */
  isUniversal?: boolean;
  isBreakRole?: boolean;
  isParkingRole?: boolean;
  isConsecutive?: boolean;

  /** Per-crew time bounds for this role */
  minMinutesPerCrew?: number;
  maxMinutesPerCrew?: number;

  /** Optional detail/variant (e.g. "bread", "signs") */
  detail?: string;
}

/**
 * Complete solver input
 */
export interface SolverInput {
  /** Date for the schedule (ISO date string) */
  date: string;
  
  /** Store constraints */
  store: StoreConstraints;
  
  /** List of crew members working this day */
  crew: SolverCrewMember[];
  
  /** Crew preferences for objective function scoring */
  preferences: PreferenceConfig[];
  
  /** Per-hour staffing requirements */
  hourlyRequirements: HourlyStaffingRequirement[];
  
  /** Per-crew required role hours */
  crewRoleRequirements: CrewRoleRequirement[];
  
  /** Coverage windows (DEMO/WINE_DEMO) */
  coverageWindows: CoverageWindow[];
  
  /** Role metadata (assignment mode, consecutive flags) */
  roleMetadata?: RoleMetadata[];
  
  /** Solver time limit in seconds (optional, default: 300) */
  timeLimitSeconds?: number;
}

// ============================================================================
// SOLVER OUTPUT
// ============================================================================

/**
 * Individual task assignment
 */
export interface TaskAssignment {
  /** Crew member ID */
  crewId: string;
  
  /** Task type */
  taskType: TaskType;
  
  /** Start time (ISO datetime or minutes since midnight) */
  startTime: number;
  
  /** End time (ISO datetime or minutes since midnight) */
  endTime: number;
}

/**
 * Solver solution metadata
 */
export interface SolverMetadata {
  /** Solver status */
  status: SolverStatus;
  
  /** Objective score (higher = better preference satisfaction) */
  objectiveScore?: number;
  
  /** Runtime in milliseconds */
  runtimeMs: number;
  
  /** MIP gap (if applicable, 0.0 = optimal) */
  mipGap?: number;
  
  /** Number of crew members */
  numCrew: number;
  
  /** Number of hours in the schedule */
  numHours: number;
  
  /** Number of task assignments */
  numAssignments: number;
  
  /** Any constraint violations or warnings */
  violations?: string[];
}

/**
 * Complete solver output
 */
export interface SolverOutput {
  /** Was the solve successful? */
  success: boolean;
  
  /** Solution metadata */
  metadata: SolverMetadata;
  
  /** List of task assignments (if successful) */
  assignments?: TaskAssignment[];
  
  /** Error message (if failed) */
  error?: string;
}
