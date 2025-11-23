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
  timeLimitSeconds?: number,
  hourlyRequirements?: Array<{ hour: number; requiredRegister: number; requiredProduct: number; requiredParkingHelm: number }>,
  roleRequirements?: Array<{
    roleId: number;
    crewId?: string;
    requiredHours?: number;
    requiredMinutes?: number;
    startMin?: number;
    endMin?: number;
  }>,
  coverageWindowsInput?: Array<{ roleCode: string; startMin: number; endMin: number; requiredCrew: number }>,
  demoWindows?: Array<{ startMin: number; endMin: number; type: 'demo' | 'wine_demo' }>
): Promise<SolverInput> {
  // Normalize date to YYYY-MM-DD
  const normDate = new Date(date).toISOString().slice(0, 10);
  const day = new Date(normDate);
  day.setUTCHours(0, 0, 0, 0);
  
  // Load store constraints and preference weights
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      baseSlotMinutes: true,
      openMinutesFromMidnight: true,
      closeMinutesFromMidnight: true,
      minShiftMinutesForBreak: true,
      breakWindowStartOffsetMinutes: true,
      breakWindowEndOffsetMinutes: true,
      startRegHour: true,
      endRegHour: true,
      consecutiveProdWeight: true,
      consecutiveRegWeight: true,
      earlyBreakWeight: true,
      lateBreakWeight: true,
      productFirstHourWeight: true,
      productTaskWeight: true,
      registerFirstHourWeight: true,
      registerTaskWeight: true,
    },
  });
  
  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }
  
  // Initialize role metadata map early
  const roleMetadataMap = new Map<number, Role>();
  
  // Load ALL roles for this store to ensure UNIVERSAL roles are in metadata
  const allStoreRoles = await prisma.role.findMany({
    where: { storeId }
  });
  allStoreRoles.forEach(role => {
    roleMetadataMap.set(role.id, role);
  });

  // Determine register role time bounds (fallback to legacy defaults for compatibility)
  const registerRole = allStoreRoles.find((role) => toTaskType(role.code) === TaskType.REGISTER);
  const defaultRegisterMinMinutes = 120;
  const defaultRegisterMaxMinutes = 300;
  const registerTimeBounds = registerRole
    ? {
        minMinutes: registerRole.minMinutesPerCrew ?? defaultRegisterMinMinutes,
        maxMinutes: registerRole.maxMinutesPerCrew ?? defaultRegisterMaxMinutes,
      }
    : null;
  
  // Load crew members with roles and preferences
  const crewIds = shifts.map(s => s.crewId);
  const crewData = await prisma.crew.findMany({
    where: { id: { in: crewIds } },
    include: crewInclude,
  }) as CrewWithRoles[];
  
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
    
  const shiftStartMin = timeToMinutes(shift.start);
  const shiftEndMin = timeToMinutes(shift.end);
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

    const shiftDurationMinutes = Math.max(shiftEndMin - shiftStartMin, 0);
    const shiftDurationHours = Math.max(shiftDurationMinutes / 60, 0);
    const hasRegisterEligibility = eligibleRolesSet.has(TaskType.REGISTER);
    const desiredMinHours = registerTimeBounds?.minMinutes ? registerTimeBounds.minMinutes / 60 : undefined;
    const desiredMaxHours = registerTimeBounds?.maxMinutes ? registerTimeBounds.maxMinutes / 60 : undefined;
    const minRegisterHours =
      hasRegisterEligibility && desiredMinHours !== undefined
        ? Math.min(desiredMinHours, shiftDurationHours)
        : undefined;
    const maxRegisterHours =
      hasRegisterEligibility && desiredMaxHours !== undefined
        ? Math.max(minRegisterHours ?? 0, Math.min(desiredMaxHours, shiftDurationHours))
        : undefined;
    
    // Look up weights from store based on crew's preferences
    const prefFirstHour = preferenceToTaskType(crewMember.prefFirstHour);
    const prefFirstHourWeight = prefFirstHour ? 1 : undefined;

    const prefTask = preferenceToTaskType(crewMember.prefTask);
    const prefTaskWeight = prefTask ? 1 : undefined;
    
    const prefBreakTimingWeight = crewMember.prefBreakTiming ? 1 : undefined;
    
    return {
      id: crewMember.id,
      name: crewMember.name,
      shiftStartMin,
      shiftEndMin,
      eligibleRoles,
      canBreak,
      canParkingHelms,
      prefFirstHour,
      prefFirstHourWeight,
      prefTask,
      prefTaskWeight,
      prefBreakTiming: crewMember.prefBreakTiming ?? undefined,
      prefBreakTimingWeight,
      minRegisterHours,
      maxRegisterHours,
    };
  });

  const crewById = new Map(crew.map(member => [member.id, member] as const));
  
  // Load hourly staffing requirements from HourlyRequirement
  // Load hourly requirements or use provided ones
  let hourlyReqs: HourlyStaffingRequirement[] = [];
  
  if (hourlyRequirements && hourlyRequirements.length > 0) {
    // Use provided hourly requirements (for testing)
    hourlyReqs = hourlyRequirements;
  } else {
    // Load from database
    const hourRules = await prisma.hourlyRequirement.findMany({
      where: {
        storeId,
        date: day,
      },
      orderBy: {
        hour: 'asc',
      },
    });
    
    hourlyReqs = hourRules.map((rule) => ({
      hour: rule.hour,
      requiredRegister: rule.requiredRegister,
      requiredProduct: rule.requiredProduct ?? 0,
      requiredParkingHelm: rule.requiredParkingHelm ?? 0,
    }));
  }
  
  // Load per-crew required role hours from CrewRoleRequirement or use provided ones
  let crewRoleRequirements: CrewRoleRequirement[] = [];
  const crewRoleRequirementRoles = new Set<TaskType>();
  
  if (roleRequirements && roleRequirements.length > 0) {
    // Use provided roleRequirements (for testing)
    const roleIds = [...new Set(roleRequirements.map(r => r.roleId))];
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } }
    });
    
    roles.forEach(role => {
      roleMetadataMap.set(role.id, role);
    });
    
    crewRoleRequirements = roleRequirements.map(req => {
      const role = roles.find(r => r.id === req.roleId);
      const resolvedRole = role ? toTaskType(role.code) : undefined;
      if (!resolvedRole) return undefined;

      const minutesFromHours = typeof req.requiredHours === 'number' ? req.requiredHours * 60 : undefined;
      const minutesFromMinutes = typeof req.requiredMinutes === 'number' ? req.requiredMinutes : undefined;
      const minutesFromWindow = req.startMin !== undefined && req.endMin !== undefined
        ? req.endMin - req.startMin
        : undefined;
      const requiredMinutes = minutesFromMinutes ?? minutesFromHours ?? minutesFromWindow;

      if (requiredMinutes === undefined || requiredMinutes <= 0) {
        return undefined;
      }

      const requiredHours = requiredMinutes / 60;

      let targetCrew: SolverCrewMember | undefined;
      if (req.crewId) {
        targetCrew = crewById.get(req.crewId);
        if (!targetCrew) {
          console.warn(`Role requirement references unknown crew ${req.crewId}`);
          return undefined;
        }
      } else {
        targetCrew = crew.find(c => c.eligibleRoles?.includes(resolvedRole));
        if (!targetCrew) {
          console.warn(`No eligible crew found for role requirement roleId=${req.roleId}`);
          return undefined;
        }
      }

      if (!targetCrew.eligibleRoles.includes(resolvedRole)) {
        targetCrew.eligibleRoles.push(resolvedRole);
      }

      const requirement: CrewRoleRequirement = {
        crewId: targetCrew.id,
        role: resolvedRole,
        requiredHours,
      };
      crewRoleRequirementRoles.add(resolvedRole);
      return requirement;
    }).filter((req): req is CrewRoleRequirement => Boolean(req));
  } else {
    // Load from database
    const dbRoleRequirements = await prisma.crewRoleRequirement.findMany({
      where: {
        storeId,
        date: day,
      },
      include: {
        Role: true,
      },
    });
    
    dbRoleRequirements.forEach((req) => {
      if (req.Role) {
        roleMetadataMap.set(req.roleId, req.Role);
      }
    });

    crewRoleRequirements = dbRoleRequirements
      .map((req) => {
        const resolvedRole = req.Role ? toTaskType(req.Role.code) : undefined;
        if (!resolvedRole) return undefined;
        crewRoleRequirementRoles.add(resolvedRole);
        return {
          crewId: req.crewId,
          role: resolvedRole,
          requiredHours: req.requiredHours,
        };
      })
      .filter((req): req is CrewRoleRequirement => Boolean(req));
  }
  
  // Load coverage windows from CoverageWindow or use provided ones
  let coverageWindows: CoverageWindow[] = [];
  const coverageWindowRoles = new Set<TaskType>();
  
  if (coverageWindowsInput && coverageWindowsInput.length > 0) {
    // Use provided coverage windows (for testing)
    const roleCodes = [...new Set(coverageWindowsInput.map(w => w.roleCode))];
    
    const roles = await prisma.role.findMany({
      where: { code: { in: roleCodes } }
    });
    
    roles.forEach(role => {
      roleMetadataMap.set(role.id, role);
    });
    
    coverageWindows = coverageWindowsInput.map(window => {
      const role = roles.find(r => r.code === window.roleCode);
      const resolvedRole = role ? toTaskType(role.code) : undefined;
      if (!resolvedRole) return undefined;
      
      coverageWindowRoles.add(resolvedRole);
      return {
        role: resolvedRole,
        startHour: Math.floor(window.startMin / 60),
        endHour: Math.ceil(window.endMin / 60),
        requiredPerHour: window.requiredCrew,
      };
    }).filter((window): window is CoverageWindow => Boolean(window));
  } else if (demoWindows && demoWindows.length > 0) {
    // Use provided demo windows (for backwards compatibility)
    const demoRoleCode = 'demo';
    const wineDemoRoleCode = 'wine_demo';
    
    const roleCodes = [...new Set(demoWindows.map(w => 
      w.type === 'demo' ? demoRoleCode : wineDemoRoleCode
    ))];
    
    const roles = await prisma.role.findMany({
      where: { code: { in: roleCodes } }
    });
    
    roles.forEach(role => {
      roleMetadataMap.set(role.id, role);
    });
    
    coverageWindows = demoWindows.map(window => {
      const roleCode = window.type === 'demo' ? demoRoleCode : wineDemoRoleCode;
      const role = roles.find(r => r.code === roleCode);
      const resolvedRole = role ? toTaskType(role.code) : undefined;
      if (!resolvedRole) return undefined;
      
      coverageWindowRoles.add(resolvedRole);
      return {
        role: resolvedRole,
        startHour: Math.floor(window.startMin / 60),
        endHour: Math.ceil(window.endMin / 60),
        requiredPerHour: 1,
      };
    }).filter((window): window is CoverageWindow => Boolean(window));
  } else {
    // Load from database
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
    
    coverageWindows = coverageData
      .map((cov) => {
        const resolvedRole = cov.Role ? toTaskType(cov.Role.code) : undefined;
        if (!resolvedRole) return undefined;
        coverageWindowRoles.add(resolvedRole);
        return {
          role: resolvedRole,
          startHour: cov.startHour,
          endHour: cov.endHour,
          requiredPerHour: cov.requiredPerHour,
        };
      })
      .filter((window): window is CoverageWindow => Boolean(window));
  }

  const roleMetadata: RoleMetadata[] = Array.from(roleMetadataMap.values())
    .map((role) => {
      const resolvedRole = toTaskType(role.code);
      if (!resolvedRole) return undefined;

      const assignmentModel: RoleMetadata['assignmentModel'] = role.isCoverageRole
        ? 'COVERAGE_WINDOW'
        : crewRoleRequirementRoles.has(resolvedRole)
        ? 'CREW_ROLE_REQUIREMENT'
        : 'HOURLY_ROLE_CONSTRAINT';

      return {
        role: resolvedRole,
        assignmentModel,
        blockSizeMinutes: role.blockSizeMinutes ?? undefined,
        minSegments: role.minSegments ?? undefined,
        maxSegments: role.maxSegments ?? undefined,
        allowOutsideStoreHours: role.allowOutsideStoreHours ?? false,
        isConsecutive: role.isConsecutive ?? false,
        isUniversal: role.isUniversal ?? false,
        isBreakRole: role.isBreakRole ?? false,
        isParkingRole: role.isParkingRole ?? false,
        minMinutesPerCrew: role.minMinutesPerCrew ?? undefined,
        maxMinutesPerCrew: role.maxMinutesPerCrew ?? undefined,
        detail: role.family ?? undefined,
      } as RoleMetadata;
    })
    .filter((meta): meta is RoleMetadata => Boolean(meta));
  
  return {
    date: normDate,
    store: {
      storeId: store.id,
      baseSlotMinutes: store.baseSlotMinutes,
      openMinutesFromMidnight: store.openMinutesFromMidnight,
      closeMinutesFromMidnight: store.closeMinutesFromMidnight,
      startRegHour: store.startRegHour,
      endRegHour: store.endRegHour,
      minShiftMinutesForBreak: store.minShiftMinutesForBreak,
      breakWindowStartOffsetMinutes: store.breakWindowStartOffsetMinutes,
      breakWindowEndOffsetMinutes: store.breakWindowEndOffsetMinutes,
      consecutiveProdWeight: store.consecutiveProdWeight,
      consecutiveRegWeight: store.consecutiveRegWeight,
      earlyBreakWeight: store.earlyBreakWeight,
      lateBreakWeight: store.lateBreakWeight,
      productFirstHourWeight: store.productFirstHourWeight,
      productTaskWeight: store.productTaskWeight,
      registerFirstHourWeight: store.registerFirstHourWeight,
      registerTaskWeight: store.registerTaskWeight,
    },
    crew,
    hourlyRequirements: hourlyReqs,
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
    const { date, store_id, shifts, time_limit_seconds, hourly_requirements, role_requirements, coverage_windows, demo_windows } = request.body;
    
    try {
      // Step 1: Build solver input from database
      const solverInput = await buildSolverInput(
        date, 
        store_id, 
        shifts, 
        time_limit_seconds,
        hourly_requirements,
        role_requirements,
        coverage_windows,
        demo_windows
      );
      
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


// PSEUDOCODE

// TAKE INPUTS FOR SOLVER, AND MAKE SURE THEY ARE VALID AND SERIALIZED.
// WE NEED TO HAVE: SHIFTS, CREWMEMBERS, ROLES, HOURLY REQUIREMENTS, ROLE REQUIREMENTS, COVERAGE WINDOWS

// ENFORCE HARD CONSTRAINTS

// FILL SOFT CONSTRAINTS WITH OBJECTIVE FUNCTION

// 
