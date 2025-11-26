import { FastifyInstance } from 'fastify';
import { Prisma, PrismaClient, type Role, type RolePreference as RolePreferenceModel, type CrewPreference as CrewPreferenceModel } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';
import crypto from 'crypto';
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
  PreferenceConfig,
  PreferenceType,
} from '@logbook-writer/shared-types';
import { saveLogbookWithMetadata } from '../services/logbook-manager';

const prisma = new PrismaClient();

const crewInclude = {
  crewRoles: {
    include: {
      role: true,
    },
  },
} satisfies Prisma.CrewInclude;

type CrewWithRoles = Prisma.CrewGetPayload<{ include: typeof crewInclude }>;

type RolePreferenceWithRole = Awaited<
  ReturnType<typeof prisma.rolePreference.findMany>
>[number];

type CrewPreferenceWithRole = Awaited<
  ReturnType<typeof prisma.crewPreference.findMany>
>[number];

type AssignmentModelValue = 'HOURLY' | 'HOURLY_WINDOW' | 'DAILY';

type CrewPreferenceRecord = CrewPreferenceModel & {
  rolePreference: RolePreferenceModel & { role: Role | null };
};

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

/**
 * Calculate adaptive boost for a crew's preference based on recent satisfaction history
 * 
 * @param crewId - Crew member ID
 * @param rolePreferenceId - Role preference ID
 * @param lookbackDays - Number of days to look back for satisfaction history (default: 7)
 * @returns adaptiveBoost value (>= 1.0, higher = more priority)
 * 
 * Algorithm:
 * - Query PreferenceSatisfaction records for last N days
 * - Calculate satisfaction rate (met / total days)
 * - Lower satisfaction = higher boost (fairness mechanism)
 * - No history = 1.0 (neutral, no boost)
 * 
 * Examples:
 * - 0% satisfied over 7 days → boost = 3.0 (high priority)
 * - 50% satisfied → boost = 2.0 (medium priority)
 * - 100% satisfied → boost = 1.0 (normal priority)
 */
async function calculateAdaptiveBoost(
  crewId: string,
  rolePreferenceId: number,
  lookbackDays: number = 7
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  
  const history = await prisma.preferenceSatisfaction.findMany({
    where: {
      crewId,
      rolePreferenceId,
      date: { gte: cutoffDate }
    },
    orderBy: { date: 'desc' }
  });
  
  // No history = default to 1.0 (neutral, no boost or penalty)
  if (history.length === 0) {
    return 1.0;
  }
  
  // Calculate satisfaction rate
  const metCount = history.filter(h => h.met).length;
  const satisfactionRate = metCount / history.length;
  
  // Adaptive boost formula: lower satisfaction = higher boost
  // Tunable parameter controls max boost (currently 2.0 = up to 3.0x)
  const BOOST_MULTIPLIER = 2.0;
  const adaptiveBoost = 1.0 + (1.0 - satisfactionRate) * BOOST_MULTIPLIER;
  
  return adaptiveBoost;
}

/**
 * Calculate and save preference satisfaction after solver completes
 * 
 * This creates the historical data that feeds back into calculateAdaptiveBoost
 */
async function savePreferenceSatisfaction(
  logbookId: string,
  date: Date,
  assignments: TaskAssignment[],
  preferences: PreferenceConfig[]
): Promise<void> {
  // Group assignments by crewId for efficient lookup
  const assignmentsByCrew = new Map<string, TaskAssignment[]>();
  for (const assignment of assignments) {
    if (!assignmentsByCrew.has(assignment.crewId)) {
      assignmentsByCrew.set(assignment.crewId, []);
    }
    assignmentsByCrew.get(assignment.crewId)!.push(assignment);
  }
  
  const satisfactionRecords: Prisma.PreferenceSatisfactionCreateManyInput[] = [];
  
  for (const pref of preferences) {
    const crewAssignments = assignmentsByCrew.get(pref.crewId) || [];
    
    let met = false;
    let satisfaction = 0.0;
    
    // Calculate satisfaction based on preference type
    switch (pref.preferenceType) {
      case 'FIRST_HOUR': {
        // Check if crew got preferred role in first assignment
        if (crewAssignments.length > 0 && pref.role) {
          const firstAssignment = crewAssignments[0];
          met = firstAssignment.taskType === pref.role;
          satisfaction = met ? 1.0 : 0.0;
        }
        break;
      }
      
      case 'FAVORITE': {
        // Calculate percentage of time spent on favorite role
        if (pref.role) {
          const totalMinutes = crewAssignments.reduce(
            (sum, a) => sum + (a.endTime - a.startTime), 
            0
          );
          const favoriteMinutes = crewAssignments
            .filter(a => a.taskType === pref.role)
            .reduce((sum, a) => sum + (a.endTime - a.startTime), 0);
          
          satisfaction = totalMinutes > 0 ? favoriteMinutes / totalMinutes : 0;
          met = satisfaction >= 0.5; // Met if >50% on favorite role
        }
        break;
      }
      
      case 'CONSECUTIVE': {
        // Check if role assignments are consecutive (no breaks in role)
        if (pref.role) {
          const roleAssignments = crewAssignments
            .filter(a => a.taskType === pref.role)
            .sort((a, b) => a.startTime - b.startTime);
          
          if (roleAssignments.length > 0) {
            let isConsecutive = true;
            for (let i = 0; i < roleAssignments.length - 1; i++) {
              if (roleAssignments[i].endTime !== roleAssignments[i + 1].startTime) {
                isConsecutive = false;
                break;
              }
            }
            met = isConsecutive;
            satisfaction = met ? 1.0 : 0.0;
          }
        }
        break;
      }
      
      case 'TIMING': {
        // Check if break timing matches preference (early vs late)
        const breakAssignments = crewAssignments.filter(
          a => a.taskType === 'BREAK' || a.taskType === 'MEAL_BREAK'
        );
        
        if (breakAssignments.length > 0 && pref.intValue !== undefined && pref.intValue !== null) {
          const shiftStart = Math.min(...crewAssignments.map(a => a.startTime));
          const shiftEnd = Math.max(...crewAssignments.map(a => a.endTime));
          const shiftLength = shiftEnd - shiftStart;
          
          const breakStart = breakAssignments[0].startTime;
          const breakOffset = breakStart - shiftStart;
          const breakPosition = shiftLength > 0 ? breakOffset / shiftLength : 0;
          
          // intValue > 0 = prefer late, intValue < 0 = prefer early
          if (pref.intValue > 0) {
            satisfaction = breakPosition; // 0.0 = early, 1.0 = late
            met = breakPosition > 0.5;
          } else {
            satisfaction = 1.0 - breakPosition; // 1.0 = early, 0.0 = late
            met = breakPosition < 0.5;
          }
        }
        break;
      }
    }
    
    // Find rolePreferenceId from the preference config
    // We need to look it up from CrewPreference
    const crewPref = await prisma.crewPreference.findFirst({
      where: {
        crewId: pref.crewId,
        rolePreference: {
          preferenceType: pref.preferenceType as any,
          role: pref.role ? { code: pref.role as string } : undefined,
        }
      },
      select: { rolePreferenceId: true }
    });
    
    if (!crewPref) {
      continue; // Skip if we can't find the role preference
    }
    
    const effectiveWeight = pref.baseWeight * pref.crewWeight * pref.adaptiveBoost;
    
    satisfactionRecords.push({
      logbookId,
      crewId: pref.crewId,
      rolePreferenceId: crewPref.rolePreferenceId,
      date,
      satisfaction,
      met,
      weightApplied: effectiveWeight,
      adaptiveBoost: pref.adaptiveBoost,
      fairnessAdjustment: 0, // TODO: Calculate fairness adjustment
    });
  }
  
  // Bulk insert all satisfaction records
  if (satisfactionRecords.length > 0) {
    await prisma.preferenceSatisfaction.createMany({
      data: satisfactionRecords,
      skipDuplicates: true,
    });
  }
  
  // Update logbook preference metadata summary
  const totalPreferences = satisfactionRecords.length;
  const preferencesMet = satisfactionRecords.filter(r => r.met).length;
  const averageSatisfaction = totalPreferences > 0
    ? satisfactionRecords.reduce((sum, r) => sum + (r.satisfaction ?? 0), 0) / totalPreferences
    : 0;
  const totalWeightApplied = satisfactionRecords.reduce((sum, r) => sum + (r.weightApplied ?? 0), 0);
  
  await prisma.logPreferenceMetadata.upsert({
    where: { logbookId },
    create: {
      id: crypto.randomUUID(),
      logbookId,
      totalPreferences,
      preferencesMet,
      averageSatisfaction,
      totalWeightApplied,
    },
    update: {
      totalPreferences,
      preferencesMet,
      averageSatisfaction,
      totalWeightApplied,
    },
  });
}

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
  const normDate = new Date(date).toISOString().slice(0, 10);
  const day = new Date(normDate);
  day.setUTCHours(0, 0, 0, 0);

  const [store, rolePreferences, allStoreRoles] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        baseSlotMinutes: true,
        openMinutesFromMidnight: true,
        closeMinutesFromMidnight: true,
        reqShiftLengthForBreak: true,
        breakWindowStart: true,
        breakWindowEnd: true,
      },
    }),
    prisma.rolePreference.findMany({
      where: { storeId },
      include: {
        role: true,
      },
    }),
    prisma.role.findMany({
      where: { storeId },
    }),
  ]);

  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }

  // Build preferences array from crew preferences
  const crewIds = shifts.map((shift) => shift.crewId);
  
  const [crewData, crewPreferenceRecords] = await Promise.all([
    prisma.crew.findMany({
      where: { id: { in: crewIds } },
      include: crewInclude,
    }) as Promise<CrewWithRoles[]>,
    crewIds.length
      ? prisma.crewPreference.findMany({
          where: { 
            crewId: { in: crewIds },
            enabled: true  // Only get enabled preferences
          },
          include: {
            rolePreference: {
              include: { role: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // Build PreferenceConfig array (replacing old hardcoded approach)
  const preferences: PreferenceConfig[] = [];
  
  for (const crewPref of crewPreferenceRecords as CrewPreferenceRecord[]) {
    const roleTaskType = toTaskType(crewPref.rolePreference.role?.code);
    
    // Calculate adaptive boost based on historical satisfaction
    const adaptiveBoost = await calculateAdaptiveBoost(
      crewPref.crewId,
      crewPref.rolePreferenceId,
      7  // Look back 7 days
    );
    
    preferences.push({
      crewId: crewPref.crewId,
      role: roleTaskType || null,
      preferenceType: crewPref.rolePreference.preferenceType as PreferenceType,
      baseWeight: crewPref.rolePreference.baseWeight,
      crewWeight: crewPref.crewWeight,
      adaptiveBoost,
      intValue: crewPref.intValue ?? undefined,
    });
  }

  const roleMetadataMap = new Map<number, Role>();
  allStoreRoles.forEach((role) => roleMetadataMap.set(role.id, role));

  const timeToMinutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const crew: SolverCrewMember[] = shifts.map((shift) => {
    const crewMember = crewData.find((c) => c.id === shift.crewId);
    if (!crewMember) {
      throw new Error(`Crew member ${shift.crewId} not found`);
    }

    const shiftStartMin = timeToMinutes(shift.start);
    const shiftEndMin = timeToMinutes(shift.end);

    const eligibleRolesSet = new Set<TaskType>();
    crewMember.crewRoles.forEach((crewRole) => {
      if (!crewRole.role) return;
      const resolvedRole = toTaskType(crewRole.role.code);
      if (!resolvedRole) return;
      eligibleRolesSet.add(resolvedRole);
      roleMetadataMap.set(crewRole.roleId, crewRole.role);
    });

    const eligibleRoles = Array.from(eligibleRolesSet);
    const canBreak = true;
    const canParkingHelms = eligibleRoles.includes(TaskType.PARKING_HELM);
    // Add break role if crew can break and doesn't already have one
    if (canBreak) {
      const hasBreak = eligibleRoles.includes(TaskType.BREAK) || eligibleRoles.includes(TaskType.MEAL_BREAK);
      if (!hasBreak) {
        // Use BREAK if it exists in the store's roles, otherwise MEAL_BREAK
        const breakRole = allStoreRoles.find(r => r.code === 'BREAK') ? TaskType.BREAK : TaskType.MEAL_BREAK;
        eligibleRoles.push(breakRole);
      }
    }

    return {
      id: crewMember.id,
      name: crewMember.name,
      shiftStartMin,
      shiftEndMin,
      eligibleRoles,
      canBreak,
      canParkingHelms,
      // Preferences are now in the separate preferences array, not on crew objects
    };
  });

  const crewById = new Map(crew.map((member) => [member.id, member] as const));

  let hourlyReqs: HourlyStaffingRequirement[] = [];
  if (hourlyRequirements && hourlyRequirements.length > 0) {
    hourlyReqs = hourlyRequirements;
  } else {
    const hourlyConstraints = await prisma.hourlyRoleConstraint.findMany({
      where: { storeId, date: day },
      include: { role: true },
      orderBy: [{ hour: 'asc' }, { roleId: 'asc' }],
    });

    const requirementMap = new Map<number, HourlyStaffingRequirement>();

    const ensureRequirement = (hour: number) => {
      let existing = requirementMap.get(hour);
      if (!existing) {
        existing = {
          hour,
          requiredRegister: 0,
          requiredProduct: 0,
          requiredParkingHelm: 0,
        };
        requirementMap.set(hour, existing);
      }
      return existing;
    };

    hourlyConstraints.forEach((constraint) => {
      if (!constraint.role) return;
      const resolvedRole = toTaskType(constraint.role.code);
      if (!resolvedRole) return;
      roleMetadataMap.set(constraint.roleId, constraint.role);

      const entry = ensureRequirement(constraint.hour);
      switch (resolvedRole) {
        case TaskType.REGISTER:
          entry.requiredRegister = constraint.requiredPerHour;
          break;
        case TaskType.PRODUCT:
          entry.requiredProduct = constraint.requiredPerHour;
          break;
        case TaskType.PARKING_HELM:
          entry.requiredParkingHelm = constraint.requiredPerHour;
          break;
        default:
          if (!entry.additionalRequirements) {
            entry.additionalRequirements = [];
          }
          entry.additionalRequirements.push({
            role: resolvedRole,
            required: constraint.requiredPerHour,
          });
          break;
      }
    });

    hourlyReqs = Array.from(requirementMap.values()).sort((a, b) => a.hour - b.hour);
  }

  let crewRoleRequirements: CrewRoleRequirement[] = [];
  if (roleRequirements && roleRequirements.length > 0) {
    const roleIds = [...new Set(roleRequirements.map((r) => r.roleId))];
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } },
    });

    roles.forEach((role) => roleMetadataMap.set(role.id, role));

    crewRoleRequirements = roleRequirements
      .map((req) => {
        const role = roles.find((r) => r.id === req.roleId);
        const resolvedRole = role ? toTaskType(role.code) : undefined;
        if (!resolvedRole) return undefined;

        const minutesFromHours =
          typeof req.requiredHours === 'number' ? req.requiredHours * 60 : undefined;
        const minutesFromMinutes =
          typeof req.requiredMinutes === 'number' ? req.requiredMinutes : undefined;
        const minutesFromWindow =
          req.startMin !== undefined && req.endMin !== undefined
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
          targetCrew = crew.find((c) => c.eligibleRoles?.includes(resolvedRole));
          if (!targetCrew) {
            console.warn(`No eligible crew found for role requirement roleId=${req.roleId}`);
            return undefined;
          }
        }

        if (!targetCrew.eligibleRoles.includes(resolvedRole)) {
          targetCrew.eligibleRoles.push(resolvedRole);
        }

        return {
          crewId: targetCrew.id,
          role: resolvedRole,
          requiredHours,
        };
      })
      .filter((req): req is CrewRoleRequirement => Boolean(req));
  } else {
    const dbRoleRequirements = await prisma.dailyRoleConstraint.findMany({
      where: { storeId, date: day },
      include: { role: true },
    });

    crewRoleRequirements = dbRoleRequirements
      .map((req) => {
        if (!req.role) return undefined;
        const resolvedRole = toTaskType(req.role.code);
        if (!resolvedRole) return undefined;
        roleMetadataMap.set(req.roleId, req.role);
        return {
          crewId: req.crewId,
          role: resolvedRole,
          requiredHours: req.requiredHours,
        };
      })
      .filter((req): req is CrewRoleRequirement => Boolean(req));
  }

  let coverageWindows: CoverageWindow[] = [];
  if (coverageWindowsInput && coverageWindowsInput.length > 0) {
    const roleCodes = [...new Set(coverageWindowsInput.map((w) => w.roleCode))];
    const roles = await prisma.role.findMany({
      where: { code: { in: roleCodes } },
    });

    roles.forEach((role) => roleMetadataMap.set(role.id, role));

    coverageWindows = coverageWindowsInput
      .map((window) => {
        const role = roles.find((r) => r.code === window.roleCode);
        const resolvedRole = role ? toTaskType(role.code) : undefined;
        if (!resolvedRole) return undefined;

        return {
          role: resolvedRole,
          startHour: Math.floor(window.startMin / 60),
          endHour: Math.ceil(window.endMin / 60),
          requiredPerHour: window.requiredCrew,
        };
      })
      .filter((window): window is CoverageWindow => Boolean(window));
  } else if (demoWindows && demoWindows.length > 0) {
    const demoRoleCode = 'demo';
    const wineDemoRoleCode = 'wine_demo';

    const roleCodes = [...new Set(
      demoWindows.map((w) => (w.type === 'demo' ? demoRoleCode : wineDemoRoleCode))
    )];

    const roles = await prisma.role.findMany({
      where: { code: { in: roleCodes } },
    });

    roles.forEach((role) => roleMetadataMap.set(role.id, role));

    coverageWindows = demoWindows
      .map((window) => {
        const roleCode = window.type === 'demo' ? demoRoleCode : wineDemoRoleCode;
        const role = roles.find((r) => r.code === roleCode);
        const resolvedRole = role ? toTaskType(role.code) : undefined;
        if (!resolvedRole) return undefined;

        return {
          role: resolvedRole,
          startHour: Math.floor(window.startMin / 60),
          endHour: Math.ceil(window.endMin / 60),
          requiredPerHour: 1,
        };
      })
      .filter((window): window is CoverageWindow => Boolean(window));
  } else {
    const coverageData = await prisma.windowRoleConstraint.findMany({
      where: { storeId, date: day },
      include: { role: true },
    });

    coverageWindows = coverageData
      .map((cov) => {
        if (!cov.role) return undefined;
        const resolvedRole = toTaskType(cov.role.code);
        if (!resolvedRole) return undefined;
        roleMetadataMap.set(cov.roleId, cov.role);

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

      const assignmentModel = (role.assignmentModel ?? 'HOURLY') as AssignmentModelValue;
      const minMinutesPerCrew = role.minSlots
        ? role.minSlots * store.baseSlotMinutes
        : undefined;
      const maxMinutesPerCrew = role.maxSlots
        ? role.maxSlots * store.baseSlotMinutes
        : undefined;

      const metadata = {
        role: resolvedRole,
        assignmentModel,
        allowOutsideStoreHours: role.allowOutsideStoreHours ?? false,
        slotsMustBeConsecutive: role.slotsMustBeConsecutive ?? false,
        minSlots: role.minSlots ?? undefined,
        maxSlots: role.maxSlots ?? undefined,
        blockSize: role.blockSize ?? 1,
        isConsecutive: role.slotsMustBeConsecutive ?? false,
        isUniversal: assignmentModel === 'HOURLY',
        isBreakRole: resolvedRole === TaskType.BREAK || resolvedRole === TaskType.MEAL_BREAK,
        isParkingRole: resolvedRole === TaskType.PARKING_HELM,
        minMinutesPerCrew,
        maxMinutesPerCrew,
        detail: role.displayName,
      } as RoleMetadata;

      return metadata;
    })
    .filter((meta): meta is RoleMetadata => Boolean(meta));

  return {
    date: normDate,
    store: {
      storeId: store.id,
      baseSlotMinutes: store.baseSlotMinutes,
      openMinutesFromMidnight: store.openMinutesFromMidnight,
      closeMinutesFromMidnight: store.closeMinutesFromMidnight,
      startRegHour: store.openMinutesFromMidnight,
      endRegHour: store.closeMinutesFromMidnight,
      reqShiftLengthForBreak: store.reqShiftLengthForBreak,
      breakWindowStart: store.breakWindowStart,
      breakWindowEnd: store.breakWindowEnd,
    },
    crew,
    preferences,  // ← NEW: Structured preference array
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
      
      // Step 3: If successful, save complete logbook with metadata, assignments, and satisfaction
      if (solverOutput.success && solverOutput.assignments && solverOutput.assignments.length > 0) {
        const normDate = new Date(date).toISOString().slice(0, 10);
        const day = new Date(normDate);
        day.setUTCHours(0, 0, 0, 0);
        
        // Use comprehensive logbook manager to create:
        // - Logbook with metadata JSON (solver stats, schedule stats, constraint counts, preference summary)
        // - Run record (linking solver execution to logbook)
        // - Assignment records (all task assignments from solver)
        // - PreferenceSatisfaction records (per-crew-preference satisfaction tracking)
        // - LogPreferenceMetadata (aggregate satisfaction summary)
        await saveLogbookWithMetadata(prisma, {
          storeId: store_id,
          date: day,
          solverOutput,
          solverInput,
          status: 'DRAFT',
        });
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
