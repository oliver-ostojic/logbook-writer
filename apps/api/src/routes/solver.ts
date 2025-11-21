import { FastifyInstance } from 'fastify';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import { 
  SolverInput, 
  SolverOutput, 
  SolverCrewMember,
  HourlyStaffingRequirement,
  CrewRoleRequirement,
  CoverageWindow,
  RoleMetadata,
  TaskType,
  TaskAssignment,
  SolverStatus,
} from '@logbook-writer/shared-types';

const prisma = new PrismaClient();

const crewInclude = {
  CrewRole: {
    include: {
      Role: true,
    },
  },
} satisfies Prisma.CrewInclude;

type CrewWithRoles = Prisma.CrewGetPayload<{ include: typeof crewInclude }>;

// Path to Python solver
const SOLVER_DIR = path.join(process.cwd(), '..', 'solver-python');
const PYTHON_VENV = path.join(SOLVER_DIR, 'venv', 'bin', 'python');

/**
 * Request body for the solve-logbook endpoint
 */
type SolveLogbookRequest = {
  date: string;
  store_id: number;
  shifts: Array<{ crewId: string; start: string; end: string }>;
  time_limit_seconds?: number;
};

const toTaskType = (value?: string | null): TaskType | undefined => {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  return Object.values(TaskType).includes(upper as TaskType) ? (upper as TaskType) : undefined;
};

const preferenceToTaskType = (value?: string | null): TaskType | undefined =>
  value ? toTaskType(value) : undefined;

/**
 * Build the complete SolverInput from database data
 */
async function buildSolverInput(
  date: string,
  storeId: number,
  shifts: Array<{ crewId: string; start: string; end: string }>,
  timeLimitSeconds?: number
): Promise<SolverInput> {
  // Normalize date to YYYY-MM-DD
  const normDate = new Date(date).toISOString().slice(0, 10);
  const day = new Date(normDate);
  day.setUTCHours(0, 0, 0, 0);
  
  // Load store constraints
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      startRegHour: true,
      endRegHour: true,
    },
  });
  
  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }
  
  // Load crew members with roles and preferences
  const crewIds = shifts.map(s => s.crewId);
  const crewData = await prisma.crew.findMany({
    where: { id: { in: crewIds } },
    include: crewInclude,
  }) as CrewWithRoles[];

  const roleMetadataMap = new Map<number, Role>();
  
  // Helper: convert HH:mm to minutes since midnight
  const timeToMinutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  
  // Build crew array with shifts and preferences
  const crew: SolverCrewMember[] = shifts.map((shift) => {
    const crewMember = crewData.find(c => c.id === shift.crewId);
    if (!crewMember) {
      throw new Error(`Crew member ${shift.crewId} not found`);
    }
    
    const eligibleRolesSet = new Set<TaskType>();
    crewMember.CrewRole.forEach((crewRole) => {
      const resolvedRole = toTaskType(crewRole.Role.code);
      if (resolvedRole) {
        eligibleRolesSet.add(resolvedRole);
        roleMetadataMap.set(crewRole.roleId, crewRole.Role);
      }
    });

    const canBreak = true;
    const eligibleRoles = Array.from(eligibleRolesSet);
    const canParkingHelms = eligibleRoles.includes(TaskType.PARKING_HELM);
    if (canBreak && !eligibleRoles.includes(TaskType.MEAL_BREAK)) {
      eligibleRoles.push(TaskType.MEAL_BREAK);
    }
    
    return {
      id: crewMember.id,
      name: crewMember.name,
      shiftStartMin: timeToMinutes(shift.start),
      shiftEndMin: timeToMinutes(shift.end),
      eligibleRoles,
      canBreak,
      canParkingHelms,
      prefFirstHour: preferenceToTaskType(crewMember.prefFirstHour),
      prefFirstHourWeight: crewMember.prefFirstHourWeight ?? undefined,
      prefTask: preferenceToTaskType(crewMember.prefTask),
      prefTaskWeight: crewMember.prefTaskWeight ?? undefined,
      consecutiveProdWeight: crewMember.consecutiveProdWeight ?? undefined,
      consecutiveRegWeight: crewMember.consecutiveRegWeight ?? undefined,
      prefBreakTiming: undefined, // Not in DB schema yet
      prefBreakTimingWeight: undefined,
    };
  });
  
  // Load hourly staffing requirements from HourlyRequirement
  const hourRules = await prisma.hourlyRequirement.findMany({
    where: {
      storeId,
      date: day,
    },
    orderBy: {
      hour: 'asc',
    },
  });
  
  const hourlyRequirements: HourlyStaffingRequirement[] = hourRules.map((rule) => ({
    hour: rule.hour,
    requiredRegister: rule.requiredRegister,
    requiredProduct: 0, // Not yet tracked separately in schema
    requiredParkingHelm: rule.requiredParkingHelm ?? 0,
  }));
  
  // Load per-crew required role hours from CrewRoleRequirement
  const roleRequirements = await prisma.crewRoleRequirement.findMany({
    where: {
      storeId,
      date: day,
    },
    include: {
      Role: true,
    },
  });
  roleRequirements.forEach((req) => {
    if (req.Role) {
      roleMetadataMap.set(req.roleId, req.Role);
    }
  });

  const crewRoleRequirements: CrewRoleRequirement[] = roleRequirements
    .map((req) => {
      const resolvedRole = req.Role ? toTaskType(req.Role.code) : undefined;
      if (!resolvedRole) return undefined;
      return {
        crewId: req.crewId,
        role: resolvedRole,
        requiredHours: req.requiredHours,
      };
    })
    .filter((req): req is CrewRoleRequirement => Boolean(req));
  
  // Load coverage windows from CoverageWindow
  const coverageData = await prisma.coverageWindow.findMany({
    where: {
      storeId,
      date: day,
    },
    include: {
      Role: true,
    },
  });
  coverageData.forEach((cov) => {
    if (cov.Role) {
      roleMetadataMap.set(cov.roleId, cov.Role);
    }
  });
  
  const coverageWindows: CoverageWindow[] = coverageData
    .map((cov) => {
      const resolvedRole = cov.Role ? toTaskType(cov.Role.code) : undefined;
      if (!resolvedRole) return undefined;
      return {
        role: resolvedRole,
        startHour: cov.startHour,
        endHour: cov.endHour,
        requiredPerHour: cov.requiredPerHour,
      };
    })
    .filter((window): window is CoverageWindow => Boolean(window));

  const roleMetadata: RoleMetadata[] = Array.from(roleMetadataMap.values())
    .filter((role) => toTaskType(role.code) !== undefined)
    .map((role) => ({
      role: toTaskType(role.code)!,
      assignmentMode: role.isCoverageRole ? 'TEAM_WINDOW' : 'INDIVIDUAL_HOURS',
      isConsecutive: role.isConsecutive ?? false,
      detail: role.family ?? undefined,
    }));
  
  return {
    date: normDate,
    store: {
      storeId: store.id,
      minRegisterHours: 0, // TODO: Add to schema if needed
      maxRegisterHours: 24, // TODO: Add to schema if needed
      regHoursStartMin: store.startRegHour,
      regHoursEndMin: store.endRegHour,
    },
    crew,
    hourlyRequirements,
    crewRoleRequirements,
    coverageWindows,
    roleMetadata,
    timeLimitSeconds: timeLimitSeconds ?? 300,
  };
}

/**
 * Call the Python MILP solver with the given input
 */
async function callPythonSolver(input: SolverInput): Promise<SolverOutput> {
  return new Promise((resolve, reject) => {
    const solverScript = path.join(SOLVER_DIR, 'solver.py');
    
    // Spawn Python process
    const pythonProcess = spawn(PYTHON_VENV, [solverScript], {
      cwd: SOLVER_DIR,
    });
    
    let stdout = '';
    let stderr = '';
    
    // Collect stdout
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    // Collect stderr
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python solver failed with code ${code}: ${stderr}`));
        return;
      }
      
      try {
        const result: SolverOutput = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        reject(new Error(`Failed to parse solver output: ${e}\nOutput: ${stdout}`));
      }
    });
    
    // Handle errors
    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python solver: ${err.message}`));
    });
    
    // Write input to stdin
    pythonProcess.stdin.write(JSON.stringify(input));
    pythonProcess.stdin.end();
  });
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
    const { date, store_id, shifts, time_limit_seconds } = request.body;
    
    try {
      // Step 1: Build solver input from database
      const solverInput = await buildSolverInput(date, store_id, shifts, time_limit_seconds);
      
      // Step 2: Call Python MILP solver
      const solverOutput = await callPythonSolver(solverInput);
      
      // Step 3: If successful, save results to database
      if (solverOutput.success && solverOutput.assignments) {
        // TODO: Create Logbook and Task records
        // For now, just return the solver output
      }
      
      return {
        ok: true,
        date: solverInput.date,
        storeId: store_id,
        solver: solverOutput,
      };
    } catch (error: any) {
      return reply.status(500).send({
        ok: false,
        error: error?.message ?? String(error),
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
      // Load test input from file
      const fs = await import('fs/promises');
      const testInputPath = path.join(SOLVER_DIR, 'test_input.json');
      const testInputRaw = await fs.readFile(testInputPath, 'utf-8');
      const testInput: SolverInput = JSON.parse(testInputRaw);
      
      // Call Python solver
      const solverOutput = await callPythonSolver(testInput);
      
      return {
        ok: true,
        message: 'Test solver call successful',
        solver: solverOutput,
      };
    } catch (error: any) {
      return reply.status(500).send({
        ok: false,
        error: error?.message ?? String(error),
      });
    }
  });
}
