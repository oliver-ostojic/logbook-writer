import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { buildSolverInputV2 } from '../solver2/builder';
import type { RoleDescriptor, SolverInputV2 } from '../solver2/types';
import { analyzeSolverResult, type AssignmentRecord } from '../services/constraint-analyzer';
import type { ConstraintViolation } from '@logbook-writer/shared-types/src/constraint-analysis';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_SRC_DIR = path.resolve(CURRENT_DIR, '..');
const PROJECT_ROOT = path.resolve(API_SRC_DIR, '../../..');
const PYTHON_MODULE = 'solver2.python.cli';
const PYTHON_SOURCE_DIR = API_SRC_DIR;
const DEFAULT_PYTHON_BIN = path.join(PROJECT_ROOT, '.venv', 'bin', 'python');
const PYTHON_FALLBACK_BIN = 'python3';
const VIOLATION_METADATA_LIMIT = 100;

type SolveRequestBody = {
  storeId: number | string;
  date: string;
  lookbackDays?: number;
  timeLimitSeconds?: number;
  includeInput?: boolean;
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

      const pythonResult = await runPythonSolverV2(solverInput, body.timeLimitSeconds);
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

      const response: Record<string, unknown> = {
        success: pythonResult.success,
        status: pythonResult.status,
        objectiveValue: pythonResult.objectiveValue,
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
  timeLimitSeconds?: number
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
              `Failed to parse solver output: ${(parseError as Error).message}\nRaw: ${stdout}`
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

    const payload = JSON.stringify({ solverInput, timeLimitSeconds });
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
