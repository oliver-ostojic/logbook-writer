import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  SolverOutput,
  TaskType,
  TaskAssignment,
  SolverStatus,
} from '@logbook-writer/shared-types/src/solver';
import type { ConstraintViolation } from '@logbook-writer/shared-types/src/constraint-analysis';
import { saveLogbookWithMetadata, type SolverOutputV2, type AssignmentV2 } from '../services/logbook-manager';
import { buildSolverInputV2, type ShiftOverrideDescriptor } from '../solver2/builder';
import type { SolverInputV2 } from '../solver2/types';
import { analyzeSolverResult, type AssignmentRecord } from '../services/constraint-analyzer';
import { analyzeFeasibility, generateUnknownInfeasibilityMessage } from '../services/feasibility-analyzer';
import { runPythonSolverV2, type PythonSolverResult } from './solver2';
import { startOfDay } from '../utils';
const prisma = new PrismaClient();

/**
 * Request body for the solve-logbook endpoint
 */
type SolveLogbookRequest = {
  date: string;
  store_id: number;
  shifts?: Array<{ crewId: string; start: string; end: string }>;
  time_limit_seconds?: number;
  lookback_days?: number;
  lookbackDays?: number;
  hourly_requirements?: Array<{ hour: number; requiredRegister: number; requiredProduct: number; requiredParkingHelm: number }>;
  role_requirements?: Array<{
    roleId: number;
    crewId?: string;
    requiredHours?: number;
    requiredMinutes?: number;
    startMin?: number;
    endMin?: number;
  }>;
  coverage_windows?: Array<{ roleCode: string; startMin: number; endMin: number; requiredCrew: number }>;
  demo_windows?: Array<{ startMin: number; endMin: number; type: 'demo' | 'wine_demo' }>;
};

const ROLE_CODE_TO_TASK_TYPE: Record<string, TaskType> = {
  REG: TaskType.REGISTER,
  REGISTER: TaskType.REGISTER,
  PROD: TaskType.PRODUCT,
  PRODUCT: TaskType.PRODUCT,
  P_HELM: TaskType.PARKING_HELM,
  PARKING_HELM: TaskType.PARKING_HELM,
  SL: TaskType.ORDER_WRITER,
  ORDER_WRITER: TaskType.ORDER_WRITER,
  ART: TaskType.ART,
  BRK: TaskType.BREAK,
  BREAK: TaskType.BREAK,
  MEAL_BREAK: TaskType.MEAL_BREAK,
  DEMO: TaskType.DEMO,
  W_DMO: TaskType.WINE_DEMO,
  WINE_DEMO: TaskType.WINE_DEMO,
};

const VIOLATION_METADATA_LIMIT = 100;

const formatViolationMessage = (violation: ConstraintViolation): string => {
  const icon = violation.severity === 'error' ? '✗' : violation.severity === 'warning' ? '•' : 'ℹ️';
  return `${icon} [${violation.category}] ${violation.message}`;
};

const toTaskType = (value?: string | null): TaskType | string | undefined => {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  // Return mapped TaskType if exists, otherwise return the role code directly
  return ROLE_CODE_TO_TASK_TYPE[upper] ?? upper;
};

const timeStringToMinutes = (value: string): number => {
  const [hourPart, minutePart] = value.split(':');
  const hours = Number(hourPart);
  const minutes = Number(minutePart);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Invalid time value: ${value}`);
  }
  return hours * 60 + minutes;
};

const buildShiftOverridesFromRequest = (
  shifts?: SolveLogbookRequest['shifts']
): ShiftOverrideDescriptor[] => {
  if (!Array.isArray(shifts)) {
    return [];
  }

  const overrides: ShiftOverrideDescriptor[] = [];
  for (const shift of shifts) {
    if (!shift?.crewId || !shift.start || !shift.end) {
      continue;
    }

    overrides.push({
      crewId: shift.crewId,
      shiftStartMin: timeStringToMinutes(shift.start),
      shiftEndMin: timeStringToMinutes(shift.end),
    });
  }

  return overrides;
};

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const mapSolverStatus = (status: string): SolverStatus => {
  switch (status) {
    case 'OPTIMAL':
      return SolverStatus.OPTIMAL;
    case 'FEASIBLE':
      return SolverStatus.FEASIBLE;
    case 'INFEASIBLE':
      return SolverStatus.INFEASIBLE;
    case 'TIME_LIMIT':
      return SolverStatus.TIME_LIMIT;
    default:
      return SolverStatus.ERROR;
  }
};

const convertAssignmentsFromPython = (
  rawAssignments: PythonSolverResult['assignments'] | undefined,
  roles: SolverInputV2['roles']
): TaskAssignment[] => {
  if (!rawAssignments || rawAssignments.length === 0) {
    return [];
  }

  const roleLookup = new Map<number, string>();
  for (const role of roles) {
    roleLookup.set(role.id, role.code);
  }

  return rawAssignments.map((assignment) => {
    const roleCode = roleLookup.get(assignment.roleId);
    if (!roleCode) {
      throw new Error(`Solver emitted roleId ${assignment.roleId} not present in solver input`);
    }
    const taskType = toTaskType(roleCode);
    if (!taskType) {
      throw new Error(`Unable to map role code ${roleCode} to TaskType`);
    }

    return {
      crewId: assignment.crewId,
      taskType,
      startTime: assignment.startMinute,
      endTime: assignment.endMinute,
    } satisfies TaskAssignment;
  });
};

const buildSolverMetadata = (
  status: SolverStatus,
  pythonResult: PythonSolverResult,
  assignments: TaskAssignment[]
) => {
  const runtimeMsRaw = (pythonResult.metadata?.runtimeMs ?? pythonResult.metadata?.runtimeMS) as
    | number
    | string
    | undefined;
  const runtimeMs = Number(runtimeMsRaw ?? 0);
  const totalMinutes = assignments.reduce((sum, assignment) => sum + (assignment.endTime - assignment.startTime), 0);
  const crewIds = new Set(assignments.map((assignment) => assignment.crewId));
  const violations = Array.isArray(pythonResult.metadata?.violations)
    ? (pythonResult.metadata?.violations as string[])
    : undefined;

  return {
    status,
    runtimeMs,
    objectiveScore: pythonResult.objectiveValue,
    numCrew: crewIds.size,
    numHours: Math.round(totalMinutes / 60),
    numAssignments: assignments.length,
    violations,
  } satisfies SolverOutput['metadata'];
};

const convertPythonResultToLegacyOutput = (
  pythonResult: PythonSolverResult,
  solverInput: SolverInputV2
): SolverOutput => {
  const status = mapSolverStatus((pythonResult.metadata?.status as string) ?? pythonResult.status);
  const assignments = convertAssignmentsFromPython(pythonResult.assignments, solverInput.roles);
  const metadata = buildSolverMetadata(status, pythonResult, assignments);

  return {
    success: pythonResult.success,
    metadata,
    assignments,
    error: pythonResult.success ? undefined : pythonResult.error,
  } satisfies SolverOutput;
};

/**
 * Convert Python solver result to V2 format (roleId-based, no enum mapping)
 */
const convertPythonResultToV2Output = (
  pythonResult: PythonSolverResult,
): SolverOutputV2 => {
  const status = mapSolverStatus((pythonResult.metadata?.status as string) ?? pythonResult.status);
  const assignments: AssignmentV2[] = (pythonResult.assignments ?? []).map(a => ({
    crewId: a.crewId,
    roleId: a.roleId,
    startMinute: a.startMinute,
    endMinute: a.endMinute,
  }));

  const runtimeMsRaw = (pythonResult.metadata?.runtimeMs ?? pythonResult.metadata?.runtimeMS) as
    | number
    | string
    | undefined;
  const runtimeMs = Number(runtimeMsRaw ?? 0);
  const totalMinutes = assignments.reduce((sum, a) => sum + (a.endMinute - a.startMinute), 0);
  const crewIds = new Set(assignments.map(a => a.crewId));

  return {
    success: pythonResult.success,
    metadata: {
      status,
      runtimeMs,
      objectiveScore: pythonResult.objectiveValue,
      numCrew: crewIds.size,
      numHours: Math.round(totalMinutes / 60),
      numAssignments: assignments.length,
    },
    assignments,
    error: pythonResult.error,
  };
};

async function runSolverV2ForLogbook(options: {
  storeId: number;
  date: string;
  lookbackDays?: number;
  timeLimitSeconds?: number;
  shiftOverrides?: ShiftOverrideDescriptor[];
}) {
  console.log(`[SOLVER DEBUG] runSolverV2ForLogbook called with:`, {
    storeId: options.storeId,
    date: options.date,
    lookbackDays: options.lookbackDays,
    hasShiftOverrides: !!options.shiftOverrides,
    shiftOverridesLength: options.shiftOverrides?.length,
  });
  
  const solverInput = await buildSolverInputV2({
    storeId: options.storeId,
    date: options.date,
    lookbackDays: options.lookbackDays,
    shiftOverrides: options.shiftOverrides,
  });

  console.log(`[SOLVER DEBUG] buildSolverInputV2 returned:`, {
    crewCount: solverInput.crew.length,
    rolesCount: solverInput.roles.length,
    coverageWindowsCount: solverInput.coverageWindows.length,
    roleFamiliesCount: solverInput.roleFamilies.length,
  });

  // Run pre-solve feasibility check
  const feasibilityResult = analyzeFeasibility(solverInput);

  // Early return if there are feasibility errors - give specific error messages
  const feasibilityErrors = feasibilityResult.violations.filter(v => v.severity === 'error');
  console.log(`[SOLVER DEBUG] Feasibility check: ${feasibilityResult.violations.length} total violations, ${feasibilityErrors.length} errors`);
  if (feasibilityErrors.length > 0) {
    console.log(`[SOLVER DEBUG] Feasibility errors:`, feasibilityErrors.map(e => e.message));
    const solverOutput: SolverOutputV2 = {
      success: false,
      error: feasibilityErrors[0].message,
      assignments: [],
      metadata: {
        status: SolverStatus.INFEASIBLE,
        runtimeMs: 0,
        numCrew: solverInput.crew.length,
        numHours: Math.ceil((solverInput.store.closeMinutesFromMidnight - solverInput.store.openMinutesFromMidnight) / 60),
        numAssignments: 0,
        feasibilityViolations: feasibilityErrors.map(v => v.message),
        feasibilityResult,
      },
    };
    return { solverInput, solverOutput };
  }

  console.log(`[SOLVER DEBUG] Feasibility passed, running Python solver...`);
  const timeLimitSeconds = options.timeLimitSeconds ?? 120; // Default to 120 seconds
  const pythonResult = await runPythonSolverV2(solverInput, timeLimitSeconds);
  console.log(`[SOLVER DEBUG] Python solver returned: success=${pythonResult.success}, status=${pythonResult.status}`);
  const constraintCounts = pythonResult.metadata?.constraintCounts as Record<string, unknown> | undefined;
  const infeasibilityWarnings = constraintCounts?.infeasibility_warnings as string[] | undefined;
  console.log(`[SOLVER DEBUG] Python infeasibility_warnings:`, infeasibilityWarnings);
  
  // Use V2 format directly - roleId-based, no enum mapping needed!
  const solverOutput = convertPythonResultToV2Output(pythonResult);

  // If solver failed, try to provide helpful error message
  if (!solverOutput.success) {
    console.log(`[SOLVER DEBUG] Solver failed, error=${solverOutput.error}`);
    // Check if Python solver has infeasibility warnings we can use
    if (infeasibilityWarnings && infeasibilityWarnings.length > 0) {
      console.log(`[SOLVER DEBUG] Using Python infeasibility warnings as errors`);
      solverOutput.error = infeasibilityWarnings[0];
      // Set ALL warnings in feasibilityViolations so frontend can display them all
      solverOutput.metadata.feasibilityViolations = infeasibilityWarnings;
    } else if (!solverOutput.error) {
      // No specific error from solver, use catch-all message
      console.log(`[SOLVER DEBUG] No error message, generating generic message`);
      solverOutput.error = generateUnknownInfeasibilityMessage(solverInput);
    }
  }
  
  // Build assignment records for constraint analysis
  const assignmentRecords: AssignmentRecord[] = (solverOutput.assignments ?? []).map(a => ({
    crewId: a.crewId,
    roleId: a.roleId,
    startMinute: a.startMinute,
    endMinute: a.endMinute,
  }));
  
  const constraintAnalysis = analyzeSolverResult({
    solverInput,
    assignments: assignmentRecords,
  });

  solverOutput.metadata.constraintAnalysis = constraintAnalysis;
  solverOutput.metadata.violations = constraintAnalysis.violations
    .slice(0, VIOLATION_METADATA_LIMIT)
    .map(formatViolationMessage);
  solverOutput.metadata.feasibilityResult = feasibilityResult;

  return { solverInput, solverOutput };
}

/**
 * Register solver-related routes
 */
export function registerSolverRoutes(app: FastifyInstance) {
  /**
   * POST /solve-logbook
   * 
   * Main endpoint to generate a daily logbook schedule using MILP solver
   */
  app.post<{ Body: SolveLogbookRequest }>('/solve-logbook', async (request, reply) => {
    const { date, store_id, shifts, time_limit_seconds, lookback_days, lookbackDays } = request.body;

    if (!date || !store_id) {
      return reply.status(400).send({ ok: false, error: 'store_id and date are required' });
    }

    const storeId = Number(store_id);
    if (!Number.isFinite(storeId)) {
      return reply.status(400).send({ ok: false, error: 'store_id must be a number' });
    }

    try {
      const shiftOverrides = buildShiftOverridesFromRequest(shifts);
      const lookbackDaysValue = parseOptionalNumber(lookback_days ?? lookbackDays);
      const timeLimitSeconds = parseOptionalNumber(time_limit_seconds);

      const { solverInput, solverOutput } = await runSolverV2ForLogbook({
        storeId,
        date,
        lookbackDays: lookbackDaysValue,
        timeLimitSeconds,
        shiftOverrides: shiftOverrides.length ? shiftOverrides : undefined,
      });

      let logbookId: string | undefined;
      if (solverOutput.success && solverOutput.assignments && solverOutput.assignments.length > 0) {
        // Use startOfDay for consistent UTC date handling
        const normalizedDate = startOfDay(date);

        logbookId = await saveLogbookWithMetadata(prisma, {
          storeId,
          date: normalizedDate,
          solverOutput,
          solverInput,
          status: 'DRAFT',
        });
      }

      return {
        ok: true,
        date,
        storeId,
        logbookId,  // Return the logbook ID so frontend can navigate directly
        solver: solverOutput,
      };
    } catch (error) {
      request.log.error({ err: error }, 'solve-logbook failed');
      return reply.status(500).send({
        ok: false,
        error: (error as Error).message,
      });
    }
  });
  
  /**
   * GET /solve-logbook (convenience endpoint for testing)
   */
  app.get('/solve-logbook', async () => {
    return {
      message: 'POST to this endpoint with { date, store_id } to generate a logbook',
    };
  });
  
  /**
   * POST /solve-logbook/test
   * 
   * Test endpoint using sample data from test_input.json
   */
  app.post('/solve-logbook/test', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Partial<SolveLogbookRequest>;
      const storeId = Number(body.store_id ?? 768);
      const date = body.date ?? new Date().toISOString().slice(0, 10);
      const shiftOverrides = buildShiftOverridesFromRequest(body.shifts);
      const lookbackDaysValue = parseOptionalNumber(body.lookback_days ?? body.lookbackDays);
      const timeLimitSeconds = parseOptionalNumber(body.time_limit_seconds);

      const { solverOutput } = await runSolverV2ForLogbook({
        storeId,
        date,
        lookbackDays: lookbackDaysValue,
        timeLimitSeconds,
        shiftOverrides: shiftOverrides.length ? shiftOverrides : undefined,
      });

      return {
        ok: true,
        message: 'Test solver call successful',
        solver: solverOutput,
      };
    } catch (error) {
      request.log.error({ err: error }, 'solve-logbook/test failed');
      return reply.status(500).send({
        ok: false,
        error: (error as Error).message,
      });
    }
  });
}


// PSEUDOCODE

// TAKE INPUTS FOR SOLVER, AND MAKE SURE THEY ARE VALID AND SERIALIZED.
// WE NEED TO HAVE: SHIFTS, CREWMEMBERS, ROLES, HOURLY REQUIREMENTS, ROLE REQUIREMENTS, COVERAGE WINDOWS

// ENFORCE HARD CONSTRAINTS

// FILL SOFT CONSTRAINTS WITH OBJECTIVE FUNCTION

// 
