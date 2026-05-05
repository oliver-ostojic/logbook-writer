import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

import { buildSolverInputV2 } from '../solver2/builder';
import type { RoleDescriptor, SolverInputV2 } from '../solver2/types';
import { analyzeSolverResult, type AssignmentRecord } from '../services/constraint-analyzer';
import type { ConstraintViolation } from '@logbook-writer/shared-types/src/constraint-analysis';
import { SolverStatus } from '@logbook-writer/shared-types/src/solver';
import { saveLogbookWithMetadata, createRunRecord, type SolverOutputV2, type AssignmentV2 } from '../services/logbook-manager';
import { startOfDay } from '../utils';
import {
  PRODUCTION_SOLVER_SETTINGS,
  PRODUCTION_TUNING_CONFIG,
  SOLVER_CONFIG,
} from '../config/solver.config';
import { rbacMiddleware, getUser } from '../middleware/rbac';
import { logLogbookGenerate, logLogbookRegenerate } from '../services/activity-logger';

const prisma = new PrismaClient();

const CURRENT_DIR = __dirname;
const API_SRC_DIR = path.resolve(CURRENT_DIR, '..');
const PROJECT_ROOT = path.resolve(API_SRC_DIR, '../../..');
// Use the refactored solver in apps/solver-python/
const PYTHON_MODULE = 'logbook_solver_v2.cli';
const TUNING_MODULE = 'tuning_engine';  // For tuning engine CLI
const PYTHON_SOURCE_DIR = path.join(PROJECT_ROOT, 'apps', 'solver-python');
const DEFAULT_PYTHON_BIN = path.join(PROJECT_ROOT, '.venv', 'bin', 'python');
const PYTHON_FALLBACK_BIN = 'python3';
const VIOLATION_METADATA_LIMIT = 100;

type SolveRequestBody = {
  storeId: number | string;
  date: string;
  lookbackDays?: number;
  timeLimitSeconds?: number;
  numWorkers?: number;  // Number of parallel search workers (default: CPU count)
  includeInput?: boolean;
  saveLogbook?: boolean;  // If true, saves logbook and triggers fairness tracking
  skipFairnessWeights?: boolean;  // If true, skips fairness boost/penalty in objective (for A/B testing)
  solutionHint?: PythonSolverAssignment[];  // Optional warmstart hint from previous solution
  settings?: {  // Tunable solver parameters
    fairnessBoost?: number;
    fairnessPenalty?: number;
    enableHardFairness?: boolean;  // If true, uses tiered rotation boost for tracked roles (default: true)
    fairnessBaseBoost?: number;  // Magnitude of fairness boost (default: 740 from PRODUCTION_SOLVER_SETTINGS)
    fairnessDebug?: boolean;  // If true, prints fairness audit table to stderr
  };
};

type TuneRequestBody = {
  storeId: number | string;
  date: string;
  lookbackDays?: number;
  includeInput?: boolean;
  saveLogbook?: boolean;  // Save the result as a logbook (triggers fairness tracking)
  settings?: {  // Tunable solver parameters (same as solve endpoint)
    fairnessBoost?: number;
    fairnessPenalty?: number;
    fairnessBaseBoost?: number;  // Base boost for tiered rotation (default: 7500)
    enableHardFairness?: boolean;  // If true, uses tiered rotation boost for tracked roles (default: true)
  };
  tuningConfig?: {
    numRegions?: number;        // Number of parallel regions (default: CPU count, max 10)
    shotsPerRegion?: number;    // Ladder iterations per region (default: 3)
    timeLimitPerShot?: number;  // Seconds per solve (default: 15)
    workersPerRegion?: number;  // Solver workers per region (default: 1)
    fairnessWeight?: number;    // Weight for fairness in scoring (default: 0.5)
  };
};

export interface PythonSolverAssignment {
  crewId: string;
  roleId: number;
  slotIndex: number;
  startMinute: number;
  endMinute: number;
}

export interface PythonSolverResult {
  status: string;
  success: boolean;
  objectiveValue: number;
  assignments: PythonSolverAssignment[];
  metadata: Record<string, unknown>;
  error?: string;
}

const formatViolationMessage = (violation: ConstraintViolation): string => {
  const icon = violation.severity === 'error' ? '✗' : violation.severity === 'warning' ? '•' : 'ℹ️';
  return `${icon} [${violation.category}] ${violation.message}`;
};

const resolveSolverStatus = (result: PythonSolverResult): SolverStatus => {
  const raw =
    (typeof result.status === 'string' && result.status) ||
    (typeof result.metadata?.status === 'string' && (result.metadata.status as string)) ||
    '';
  const mapped = SolverStatus[raw as keyof typeof SolverStatus];
  if (mapped) return mapped;
  return result.success ? SolverStatus.FEASIBLE : SolverStatus.ERROR;
};

export async function registerSolverV2Routes(app: FastifyInstance) {
  app.get('/solver/v2/input', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const storeIdParam = query.storeId;
    const dateParam = query.date;
    const lookbackParam = query.lookbackDays;

    if (!storeIdParam || !dateParam) {
      return reply.code(400).send({ error: 'storeId and date query params are required' });
    }

    const storeId = Number(storeIdParam);
    if (Number.isNaN(storeId)) {
      return reply.code(400).send({ error: 'storeId must be a number' });
    }

    let lookbackDays: number | undefined;
    if (lookbackParam !== undefined) {
      lookbackDays = Number(lookbackParam);
      if (Number.isNaN(lookbackDays) || lookbackDays <= 0) {
        return reply.code(400).send({ error: 'lookbackDays must be a positive number if provided' });
      }
    }

    const input = await buildSolverInputV2({
      storeId,
      date: dateParam,
      lookbackDays,
    });

    return { success: true, data: input };
  });

  app.post('/solver/v2/solve', {
    preHandler: rbacMiddleware({
      allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'],
      // Note: storeId comes from body, not URL params, so we check manually below
    }),
  }, async (request, reply) => {
    const body = request.body as SolveRequestBody | undefined;
    if (!body) {
      return reply.code(400).send({ success: false, error: 'storeId and date are required' });
    }

    const storeId = Number(body.storeId);
    if (!body.date || Number.isNaN(storeId)) {
      return reply.code(400).send({ success: false, error: 'storeId (number) and date are required' });
    }

    // Manual store access check (since storeId comes from body, not URL params)
    const user = getUser(request);
    if (user && user.role !== 'ADMIN' && user.storeId !== storeId) {
      return reply.code(403).send({ error: 'Forbidden', message: 'You do not have access to this store' });
    }

    let lookbackDays: number | undefined;
    if (body.lookbackDays !== undefined) {
      lookbackDays = Number(body.lookbackDays);
      if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
        return reply.code(400).send({ success: false, error: 'lookbackDays must be a positive number when provided' });
      }
    }

    // Check if a logbook already exists for this date (to determine generate vs regenerate)
    const normalizedDateForCheck = startOfDay(body.date);
    const existingLogbook = await prisma.logbook.findFirst({
      where: { storeId, date: normalizedDateForCheck },
      select: { id: true },
    });
    const hadExistingLogbook = existingLogbook !== null;

    try {
      const solverInput = await buildSolverInputV2({
        storeId,
        date: body.date,
        lookbackDays,
      });
      
      // Set skipFairnessWeights flag for A/B testing (default: false)
      solverInput.skipFairnessWeights = body.skipFairnessWeights ?? false;
      
      // Apply production fairness settings, allow overrides from request
      solverInput.settings = {
        ...PRODUCTION_SOLVER_SETTINGS,
        ...body.settings,
      };

      if (solverInput.settings?.fairnessDebug) {
        process.stderr.write(
          `\n[FAIRNESS PRE-SOLVE] enableHardFairness=${solverInput.settings.enableHardFairness} ` +
          `baseBoost=${solverInput.settings.fairnessBaseBoost} ` +
          `trackers=${solverInput.fairnessTrackers.length} ` +
          `historyRecords=${solverInput.fairnessHistory.length} ` +
          `shiftHistoryRecords=${solverInput.shiftHistory.length}\n`
        );
      }

      const timeLimitSeconds = body.timeLimitSeconds ?? SOLVER_CONFIG.timeLimitSeconds;
      const numWorkers = body.numWorkers ?? SOLVER_CONFIG.numWorkers;
      const solutionHint = body.solutionHint;  // Optional warmstart hint
      const solveStartedAt = Date.now();
      const pythonResult = await runPythonSolverV2(solverInput, timeLimitSeconds, numWorkers, solutionHint);
      const wallClockMs = Date.now() - solveStartedAt;
      const assignments = enrichAssignments(pythonResult.assignments ?? [], solverInput.roles);

      const assignmentRecords: AssignmentRecord[] = (pythonResult.assignments ?? []).map(
        (assignment) => ({
          crewId: assignment.crewId,
          roleId: assignment.roleId,
          startMinute: assignment.startMinute,
          endMinute: assignment.endMinute,
        })
      );

      let constraintAnalysis = analyzeSolverResult({
        solverInput,
        assignments: assignmentRecords,
      });

      let violations = constraintAnalysis.violations;
      if (!pythonResult.success && violations.length === 0) {
        violations = [
          {
            severity: 'error',
            category: 'other',
            message: `Solver returned ${pythonResult.status}. Inspect guardrail counts and inputs for infeasibility.`,
          },
        ];
        constraintAnalysis = {
          ...constraintAnalysis,
          violations,
        };
      }

      const formattedViolations = violations
        .slice(0, VIOLATION_METADATA_LIMIT)
        .map(formatViolationMessage);

      // Convert to SolverOutputV2 format (used for both logbook and run record)
      const normalizedDate = startOfDay(body.date);
      const resolvedStatus = resolveSolverStatus(pythonResult);
      const solverOutput: SolverOutputV2 = {
        success: pythonResult.success,
        metadata: {
          status: resolvedStatus,
          objectiveScore: pythonResult.metadata?.objectiveScore as number | undefined,
          runtimeMs: wallClockMs,
          mipGap: pythonResult.metadata?.mipGap as number | undefined,
          numCrew: (pythonResult.metadata?.numCrew as number) ?? 0,
          numHours: (pythonResult.metadata?.numHours as number) ?? 0,
          numAssignments: pythonResult.assignments?.length ?? 0,
          violations: formattedViolations,
          constraintAnalysis,
        },
        assignments: pythonResult.assignments?.map(a => ({
          crewId: a.crewId,
          roleId: a.roleId,
          startMinute: a.startMinute,
          endMinute: a.endMinute,
        })) ?? [],
      };

      // Optionally save logbook (triggers fairness tracking)
      let logbookId: string | undefined;
      if (body.saveLogbook && pythonResult.success && pythonResult.assignments && pythonResult.assignments.length > 0) {
        logbookId = await saveLogbookWithMetadata(prisma, {
          storeId,
          date: normalizedDate,
          solverOutput,
          solverInput,
          status: 'DRAFT',
        });

        request.log.info({ logbookId, date: body.date }, 'Logbook saved with fairness tracking');

        // Log activity for logbook generation
        const user = getUser(request);
        if (user && logbookId) {
          if (hadExistingLogbook) {
            await logLogbookRegenerate(user.id, storeId, logbookId, normalizedDate, 'constraints_changed');
          } else {
            await logLogbookGenerate(user.id, storeId, logbookId, normalizedDate);
          }
        }
      }

      // Create Run record for auditing (tracks all solver executions)
      const runId = await createRunRecord(prisma, {
        storeId,
        date: startOfDay(body.date),
        engine: 'SOLVER_V2',
        seed: 0, // Could be made configurable
        solverOutput,
        logbookId,
        inputParams: {
          timeLimitSeconds: body.timeLimitSeconds,
          saveLogbook: body.saveLogbook,
          skipFairnessWeights: body.skipFairnessWeights,
          lookbackDays: body.lookbackDays,
          numWorkers: body.numWorkers,
          settings: body.settings,
        },
        solverVersion: pythonResult.metadata?.solverVersion as string | undefined,
        triggeredBy: 'API', // Could be extracted from auth headers
        constraintCount: (solverInput.coverageWindows?.length ?? 0) + (solverInput.roleRules?.length ?? 0),
        variableCount: pythonResult.metadata?.numVariables as number | undefined,
      });

      request.log.info({ runId, logbookId }, 'Run record created');

      const response: Record<string, unknown> = {
        success: pythonResult.success,
        status: resolvedStatus,
        objectiveValue: pythonResult.objectiveValue,
        logbookId,  // Include logbook ID if saved
        metadata: {
          ...pythonResult.metadata,
          status: resolvedStatus,
          runtimeMs: wallClockMs,
          constraintAnalysis,
          violations: formattedViolations,
        },
        assignments,
        constraintAnalysis,
        violations: formattedViolations,
      };

      if (body.includeInput) {
        response.input = solverInput;
      }

      return response;
    } catch (error) {
      request.log.error({ err: error }, 'solver/v2 execution failed');
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });

  // =========================================================================
  // TUNING ENDPOINT - Uses parallel region search for optimized schedules
  // =========================================================================
  app.post('/solver/v2/tune', {
    preHandler: rbacMiddleware({
      allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'],
      // Note: storeId comes from body, not URL params, so we check manually below
    }),
  }, async (request, reply) => {
    const body = request.body as TuneRequestBody | undefined;
    if (!body) {
      return reply.code(400).send({ success: false, error: 'storeId and date are required' });
    }

    const storeId = Number(body.storeId);
    if (!body.date || Number.isNaN(storeId)) {
      return reply.code(400).send({ success: false, error: 'storeId (number) and date are required' });
    }

    // Manual store access check (since storeId comes from body, not URL params)
    const user = getUser(request);
    if (user && user.role !== 'ADMIN' && user.storeId !== storeId) {
      return reply.code(403).send({ error: 'Forbidden', message: 'You do not have access to this store' });
    }

    let lookbackDays: number | undefined;
    if (body.lookbackDays !== undefined) {
      lookbackDays = Number(body.lookbackDays);
      if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
        return reply.code(400).send({ success: false, error: 'lookbackDays must be a positive number when provided' });
      }
    }

    // Check if a logbook already exists for this date (to determine generate vs regenerate)
    const normalizedDateForCheck = startOfDay(body.date);
    const existingLogbook = await prisma.logbook.findFirst({
      where: { storeId, date: normalizedDateForCheck },
      select: { id: true },
    });
    const hadExistingLogbook = existingLogbook !== null;

    try {
      const solverInput = await buildSolverInputV2({
        storeId,
        date: body.date,
        lookbackDays,
      });

      // Apply production fairness settings, then request overrides
      solverInput.settings = {
        ...PRODUCTION_SOLVER_SETTINGS,
        ...solverInput.settings,
        ...body.settings,  // Allow request to override (e.g., for A/B testing BASE_BOOST)
      };

      // Merge production tuning config with request overrides
      const tuningConfig = {
        ...PRODUCTION_TUNING_CONFIG,
        ...body.tuningConfig,
      };
      const tuneStartedAt = Date.now();
      const pythonResult = await runPythonTuningEngine(solverInput, tuningConfig);
      const wallClockMs = Date.now() - tuneStartedAt;
      const assignments = enrichAssignments(pythonResult.assignments ?? [], solverInput.roles);

      const assignmentRecords: AssignmentRecord[] = (pythonResult.assignments ?? []).map(
        (assignment) => ({
          crewId: assignment.crewId,
          roleId: assignment.roleId,
          startMinute: assignment.startMinute,
          endMinute: assignment.endMinute,
        })
      );

      let constraintAnalysis = analyzeSolverResult({
        solverInput,
        assignments: assignmentRecords,
      });

      let violations = constraintAnalysis.violations;
      if (!pythonResult.success && violations.length === 0) {
        violations = [
          {
            severity: 'error',
            category: 'other',
            message: `Tuning returned ${pythonResult.status}. Inspect inputs for infeasibility.`,
          },
        ];
        constraintAnalysis = {
          ...constraintAnalysis,
          violations,
        };
      }

      const formattedViolations = violations
        .slice(0, VIOLATION_METADATA_LIMIT)
        .map(formatViolationMessage);

      // Convert to SolverOutputV2 format (used for both logbook and run record)
      const normalizedDate = startOfDay(body.date);
      const resolvedStatus = resolveSolverStatus(pythonResult);
      const solverOutput: SolverOutputV2 = {
        success: pythonResult.success,
        metadata: {
          status: resolvedStatus,
          objectiveScore: pythonResult.metadata?.objectiveScore as number | undefined,
          runtimeMs: wallClockMs,
          mipGap: pythonResult.metadata?.mipGap as number | undefined,
          numCrew: (pythonResult.metadata?.numCrew as number) ?? 0,
          numHours: (pythonResult.metadata?.numHours as number) ?? 0,
          numAssignments: pythonResult.assignments?.length ?? 0,
          violations: formattedViolations,
          constraintAnalysis,
        },
        assignments: pythonResult.assignments?.map(a => ({
          crewId: a.crewId,
          roleId: a.roleId,
          startMinute: a.startMinute,
          endMinute: a.endMinute,
        })) ?? [],
      };

      // Optionally save logbook (triggers fairness tracking)
      let logbookId: string | undefined;
      if (body.saveLogbook && pythonResult.success && pythonResult.assignments && pythonResult.assignments.length > 0) {
        logbookId = await saveLogbookWithMetadata(prisma, {
          storeId,
          date: normalizedDate,
          solverOutput,
          solverInput,
          status: 'DRAFT',
        });

        request.log.info({ logbookId, date: body.date }, 'Tuned logbook saved with fairness tracking');

        // Log activity for logbook generation
        const user = getUser(request);
        if (user && logbookId) {
          if (hadExistingLogbook) {
            await logLogbookRegenerate(user.id, storeId, logbookId, normalizedDate, 'tuning_optimized');
          } else {
            await logLogbookGenerate(user.id, storeId, logbookId, normalizedDate);
          }
        }
      }

      // Create Run record for auditing (tracks all solver executions)
      const runId = await createRunRecord(prisma, {
        storeId,
        date: startOfDay(body.date),
        engine: 'TUNING_ENGINE',
        seed: 0,
        solverOutput,
        logbookId,
        inputParams: {
          saveLogbook: body.saveLogbook,
          lookbackDays: body.lookbackDays,
          settings: body.settings,
        },
        solverVersion: pythonResult.metadata?.solverVersion as string | undefined,
        triggeredBy: 'API',
        constraintCount: (solverInput.coverageWindows?.length ?? 0) + (solverInput.roleRules?.length ?? 0),
        variableCount: pythonResult.metadata?.numVariables as number | undefined,
      });

      request.log.info({ runId, logbookId }, 'Run record created for tuning engine');

      const response: Record<string, unknown> = {
        success: pythonResult.success,
        status: resolvedStatus,
        objectiveValue: pythonResult.objectiveValue,
        logbookId,
        metadata: {
          ...pythonResult.metadata,
          status: resolvedStatus,
          runtimeMs: wallClockMs,
          constraintAnalysis,
          violations: formattedViolations,
          tuningEngine: true,
        },
        assignments,
        constraintAnalysis,
        violations: formattedViolations,
      };

      if (body.includeInput) {
        response.input = solverInput;
      }

      return response;
    } catch (error) {
      request.log.error({ err: error }, 'solver/v2/tune execution failed');
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });
}

function resolvePythonBinary(): string {
  if (process.env.SOLVER_V2_PYTHON) {
    return process.env.SOLVER_V2_PYTHON;
  }

  if (fs.existsSync(DEFAULT_PYTHON_BIN)) {
    return DEFAULT_PYTHON_BIN;
  }

  const alt = DEFAULT_PYTHON_BIN.endsWith('python')
    ? `${DEFAULT_PYTHON_BIN}3`
    : DEFAULT_PYTHON_BIN;
  if (fs.existsSync(alt)) {
    return alt;
  }

  return PYTHON_FALLBACK_BIN;
}

function buildPythonPathEnv(): string {
  const segments = [PYTHON_SOURCE_DIR, process.env.PYTHONPATH].filter(Boolean) as string[];
  return segments.join(path.delimiter);
}

export async function runPythonSolverV2(
  solverInput: SolverInputV2,
  timeLimitSeconds?: number,
  numWorkers?: number,
  solutionHint?: PythonSolverAssignment[]
): Promise<PythonSolverResult> {
  const pythonBin = resolvePythonBinary();
  const pythonPath = buildPythonPathEnv();

  return new Promise<PythonSolverResult>((resolve, reject) => {
    const child = spawn(pythonBin, ['-m', PYTHON_MODULE], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      // Print Python stderr in real-time for debugging
      process.stderr.write(text);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      let parsed: PythonSolverResult | undefined;
      if (stdout.trim()) {
        try {
          parsed = JSON.parse(stdout) as PythonSolverResult;
        } catch (parseError) {
          return reject(
            new Error(
              `Failed to parse solver output: ${(parseError as Error).message}\nRaw output: ${stdout}`
            )
          );
        }
      }

      if (code !== 0) {
        const message = parsed?.error || stderr || `Solver process exited with code ${code}`;
        return reject(new Error(message));
      }

      if (!parsed) {
        return reject(new Error('Solver returned empty output'));
      }

      resolve(parsed);
    });

    const payload = JSON.stringify({ solverInput, timeLimitSeconds, numWorkers, solutionHint });
    child.stdin?.write(payload);
    child.stdin?.end();
  });
}

/**
 * Configuration for the tuning engine
 */
export interface TuningConfig {
  numRegions?: number;        // Number of parallel regions (default: 14 - optimal)
  shotsPerRegion?: number;    // Ladder iterations per region (default: 3)
  timeLimitPerShot?: number;  // Seconds per solve (default: 15)
  workersPerRegion?: number;  // Solver workers per region (default: 1)
  fairnessWeight?: number;    // Weight for fairness in scoring (default: 0.5)
}

/**
 * Run the Python tuning engine with parallel region search
 * 
 * OPTIMAL CONFIGURATION (tested December 25, 2025):
 * - numRegions=14 (best speed/quality balance)
 * - shotsPerRegion=3 (quick ladder iterations)
 * - timeLimitPerShot=15 (fast but thorough)
 * - workersPerRegion=1 (deterministic within region)
 * - fairnessWeight=0.5 (balanced)
 */
export async function runPythonTuningEngine(
  solverInput: SolverInputV2,
  tuningConfig: TuningConfig = {}
): Promise<PythonSolverResult> {
  const pythonBin = resolvePythonBinary();
  const pythonPath = buildPythonPathEnv();

  return new Promise<PythonSolverResult>((resolve, reject) => {
    const child = spawn(pythonBin, ['-m', TUNING_MODULE], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      // Print Python stderr in real-time for debugging
      process.stderr.write(text);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      let parsed: PythonSolverResult | undefined;
      if (stdout.trim()) {
        try {
          parsed = JSON.parse(stdout) as PythonSolverResult;
        } catch (parseError) {
          return reject(
            new Error(
              `Failed to parse tuning output: ${(parseError as Error).message}\nRaw output: ${stdout}`
            )
          );
        }
      }

      if (code !== 0) {
        const message = parsed?.error || stderr || `Tuning process exited with code ${code}`;
        return reject(new Error(message));
      }

      if (!parsed) {
        return reject(new Error('Tuning engine returned empty output'));
      }

      resolve(parsed);
    });

    const payload = JSON.stringify({ solverInput, tuningConfig });
    child.stdin?.write(payload);
    child.stdin?.end();
  });
}

function enrichAssignments(
  assignments: PythonSolverAssignment[],
  roles: RoleDescriptor[]
) {
  const roleLookup = new Map<number, RoleDescriptor>();
  for (const role of roles) {
    roleLookup.set(role.id, role);
  }

  return assignments.map((assignment) => {
    const role = roleLookup.get(assignment.roleId);
    return {
      ...assignment,
      roleCode: role?.code ?? null,
      roleName: role?.displayName ?? null,
    };
  });
}
