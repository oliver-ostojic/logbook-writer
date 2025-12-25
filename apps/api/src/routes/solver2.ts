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
import { saveLogbookWithMetadata, type SolverOutputV2, type AssignmentV2 } from '../services/logbook-manager';
import { startOfDay } from '../utils';

const prisma = new PrismaClient();

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
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
  settings?: {  // Tunable solver parameters
    fairnessBoost?: number;
    fairnessPenalty?: number;
    enableHardFairness?: boolean;  // If true, uses tiered rotation boost for tracked roles (default: true)
  };
};

type TuneRequestBody = {
  storeId: number | string;
  date: string;
  lookbackDays?: number;
  includeInput?: boolean;
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

  app.post('/solver/v2/solve', async (request, reply) => {
    const body = request.body as SolveRequestBody | undefined;
    if (!body) {
      return reply.code(400).send({ success: false, error: 'storeId and date are required' });
    }

    const storeId = Number(body.storeId);
    if (!body.date || Number.isNaN(storeId)) {
      return reply.code(400).send({ success: false, error: 'storeId (number) and date are required' });
    }

    let lookbackDays: number | undefined;
    if (body.lookbackDays !== undefined) {
      lookbackDays = Number(body.lookbackDays);
      if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
        return reply.code(400).send({ success: false, error: 'lookbackDays must be a positive number when provided' });
      }
    }

    try {
      const solverInput = await buildSolverInputV2({
        storeId,
        date: body.date,
        lookbackDays,
      });
      
      // Set skipFairnessWeights flag for A/B testing (default: false)
      solverInput.skipFairnessWeights = body.skipFairnessWeights ?? false;
      
      // Pass through settings (fairnessBoost, fairnessPenalty, etc.)
      // Default enableHardFairness to true for production (tiered rotation boost)
      solverInput.settings = {
        enableHardFairness: true,  // Enable tiered rotation boost by default
        ...body.settings,
      };

      const timeLimitSeconds = body.timeLimitSeconds ?? 120; // Default to 120 seconds
      const numWorkers = body.numWorkers;  // undefined = use default (os.cpu_count())
      const pythonResult = await runPythonSolverV2(solverInput, timeLimitSeconds, numWorkers);
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

      // Optionally save logbook (triggers fairness tracking)
      let logbookId: string | undefined;
      if (body.saveLogbook && pythonResult.success && pythonResult.assignments && pythonResult.assignments.length > 0) {
        const normalizedDate = startOfDay(body.date);
        
        // Convert to SolverOutputV2 format expected by saveLogbookWithMetadata
        const solverOutput: SolverOutputV2 = {
          success: pythonResult.success,
          metadata: {
            status: SolverStatus[pythonResult.status as keyof typeof SolverStatus] ?? SolverStatus.ERROR,
            objectiveScore: pythonResult.objectiveValue,
            runtimeMs: (pythonResult.metadata?.runtimeMs as number) ?? 0,
            mipGap: pythonResult.metadata?.mipGap as number | undefined,
            numCrew: (pythonResult.metadata?.numCrew as number) ?? 0,
            numHours: (pythonResult.metadata?.numHours as number) ?? 0,
            numAssignments: pythonResult.assignments?.length ?? 0,
            violations: formattedViolations,
            constraintAnalysis,
          },
          assignments: pythonResult.assignments.map(a => ({
            crewId: a.crewId,
            roleId: a.roleId,
            startMinute: a.startMinute,
            endMinute: a.endMinute,
          })),
        };

        logbookId = await saveLogbookWithMetadata(prisma, {
          storeId,
          date: normalizedDate,
          solverOutput,
          solverInput,
          status: 'DRAFT',
        });
        
        request.log.info({ logbookId, date: body.date }, 'Logbook saved with fairness tracking');
      }

      const response: Record<string, unknown> = {
        success: pythonResult.success,
        status: pythonResult.status,
        objectiveValue: pythonResult.objectiveValue,
        logbookId,  // Include logbook ID if saved
        metadata: {
          ...pythonResult.metadata,
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
  app.post('/solver/v2/tune', async (request, reply) => {
    const body = request.body as TuneRequestBody | undefined;
    if (!body) {
      return reply.code(400).send({ success: false, error: 'storeId and date are required' });
    }

    const storeId = Number(body.storeId);
    if (!body.date || Number.isNaN(storeId)) {
      return reply.code(400).send({ success: false, error: 'storeId (number) and date are required' });
    }

    let lookbackDays: number | undefined;
    if (body.lookbackDays !== undefined) {
      lookbackDays = Number(body.lookbackDays);
      if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
        return reply.code(400).send({ success: false, error: 'lookbackDays must be a positive number when provided' });
      }
    }

    try {
      const solverInput = await buildSolverInputV2({
        storeId,
        date: body.date,
        lookbackDays,
      });

      // Run the tuning engine with parallel region search
      const tuningConfig = body.tuningConfig ?? {};
      const pythonResult = await runPythonTuningEngine(solverInput, tuningConfig);
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

      const response: Record<string, unknown> = {
        success: pythonResult.success,
        status: pythonResult.status,
        objectiveValue: pythonResult.objectiveValue,
        metadata: {
          ...pythonResult.metadata,
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
  numWorkers?: number
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

    const payload = JSON.stringify({ solverInput, timeLimitSeconds, numWorkers });
    child.stdin?.write(payload);
    child.stdin?.end();
  });
}

/**
 * Configuration for the tuning engine
 */
export interface TuningConfig {
  numRegions?: number;        // Number of parallel regions (default: CPU count, max 10)
  shotsPerRegion?: number;    // Ladder iterations per region (default: 3)
  timeLimitPerShot?: number;  // Seconds per solve (default: 15)
  workersPerRegion?: number;  // Solver workers per region (default: 1)
  fairnessWeight?: number;    // Weight for fairness in scoring (default: 0.5)
}

/**
 * Run the Python tuning engine with parallel region search
 * 
 * Best configuration for 10-core machines:
 * - numRegions=10 (one per core)
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
