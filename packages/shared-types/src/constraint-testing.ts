/**
 * Types for testing solver constraints against historical handwritten logbooks
 * 
 * This allows comparing automated solver output against past manual schedules
 * to validate constraint satisfaction and measure improvements.
 */

import { SolverInput, SolverOutput } from './solver';

/**
 * A single crew member's assignment in a historical logbook
 */
export interface HistoricalAssignment {
  crewId: string;
  crewName: string;
  role: string;
  startMinutes: number;  // minutes from midnight
  endMinutes: number;    // minutes from midnight
}

/**
 * Metadata about a historical logbook's constraint compliance
 */
export interface HistoricalConstraintAnalysis {
  // Store hour violations
  assignmentsOutsideStoreHours: number;
  
  // Break policy violations
  shiftsRequiringBreakWithoutBreak: number;
  breaksOutsideWindow: number;
  
  // Role constraint violations
  hourlyConstraintsViolated: Array<{
    hour: number;
    role: string;
    required: number;
    actual: number;
  }>;
  
  windowConstraintsViolated: Array<{
    startHour: number;
    endHour: number;
    role: string;
    required: number;
    actual: number;
  }>;
  
  dailyConstraintsViolated: Array<{
    crewId: string;
    crewName: string;
    role: string;
    requiredHours: number;
    actualHours: number;
  }>;
  
  // Consecutive slot violations
  roleNonConsecutiveViolations: Array<{
    crewId: string;
    crewName: string;
    role: string;
    fragmentCount: number;
  }>;
  
  // Min/max slot violations
  slotSizeViolations: Array<{
    crewId: string;
    crewName: string;
    role: string;
    blockSlots: number;
    minSlots: number;
    maxSlots: number;
  }>;
  
  // Preference satisfaction
  preferencesSatisfied: number;
  totalPreferences: number;
  satisfactionScore: number;
}

/**
 * A historical logbook with actual manual assignments and expected constraints
 */
export interface HistoricalLogbook {
  // Metadata
  id: string;
  date: string;
  description: string;
  
  // The manual schedule that was created
  assignments: HistoricalAssignment[];
  
  // The constraint setup that should have been enforced
  solverInput: SolverInput;
  
  // Analysis of how well the manual schedule satisfied constraints
  manualAnalysis: HistoricalConstraintAnalysis;
  
  // Notes about why certain violations existed in manual schedule
  notes?: string;
}

/**
 * Comparison between manual and automated schedules
 */
export interface ScheduleComparison {
  historicalId: string;
  date: string;
  
  // Manual schedule analysis
  manual: {
    assignments: HistoricalAssignment[];
    analysis: HistoricalConstraintAnalysis;
  };
  
  // Solver schedule analysis
  solver: {
    output: SolverOutput;
    analysis: HistoricalConstraintAnalysis;
  };
  
  // Improvement metrics
  improvements: {
    constraintViolationsReduced: number;
    preferenceSatisfactionImprovement: number;
    objectiveScoreDelta: number;
    
    // Detailed breakdowns
    storeHoursFixed: boolean;
    breakPolicyFixed: boolean;
    hourlyConstraintsFixed: number;
    windowConstraintsFixed: number;
    dailyConstraintsFixed: number;
    consecutiveViolationsFixed: number;
    slotSizeViolationsFixed: number;
  };
  
  // Regression warnings
  regressions: string[];
  
  // Overall assessment
  verdict: 'BETTER' | 'SAME' | 'WORSE';
  summary: string;
}

/**
 * Test scenario for validating a specific constraint type
 */
export interface ConstraintTestScenario {
  id: string;
  name: string;
  description: string;
  constraintType: 
    | 'STORE_HOURS'
    | 'BREAK_POLICY'
    | 'HOURLY_CONSTRAINT'
    | 'WINDOW_CONSTRAINT'
    | 'DAILY_CONSTRAINT'
    | 'CONSECUTIVE_SLOTS'
    | 'MIN_MAX_SLOTS'
    | 'OUTSIDE_HOURS_ALLOWED'
    | 'PREFERENCE_WEIGHTS';
  
  // The solver input designed to test this constraint
  solverInput: SolverInput;
  
  // Expected outcomes
  expectations: {
    shouldSucceed: boolean;
    shouldFailWith?: string[];  // expected violation messages
    requiredAssignments?: Array<{
      crewId: string;
      role: string;
      minSlots?: number;
      maxSlots?: number;
    }>;
  };
  
  // Validation function name to run
  validator?: string;
}

/**
 * Results from running constraint test scenarios
 */
export interface ConstraintTestResults {
  scenario: ConstraintTestScenario;
  solverOutput: SolverOutput;
  
  // Validation results
  passed: boolean;
  errors: string[];
  warnings: string[];
  
  // Detailed analysis
  actualConstraintSatisfaction: {
    storeHours: boolean;
    breakPolicy: boolean;
    hourlyConstraints: boolean;
    windowConstraints: boolean;
    dailyConstraints: boolean;
    consecutiveSlots: boolean;
    minMaxSlots: boolean;
  };
  
  // Performance metrics
  solveTimeMs: number;
  objectiveScore?: number;
  
  // Human-readable summary
  summary: string;
}

/**
 * Collection of test scenarios for comprehensive validation
 */
export interface ConstraintTestSuite {
  name: string;
  description: string;
  scenarios: ConstraintTestScenario[];
  historicalLogbooks: HistoricalLogbook[];
}
