import { FastifyInstance } from 'fastify';
import { PrismaClient, Prisma } from '@prisma/client';
import { 
  SolverInput, 
  SolverCrewMember,
  HourlyStaffingRequirement,
  CrewRoleRequirement,
  CoverageWindow,
  RoleMetadata,
  TaskType,
  PreferenceConfig,
  PreferenceType,
} from '@logbook-writer/shared-types';

const prisma = new PrismaClient();

/**
 * GET /solver/input/:storeId/:date
 * 
 * Returns complete SolverInput for a given store and date.
 * Fetches:
 * - Store metadata (slot size, hours, break policy)
 * - All roles with metadata (minSlots, maxSlots, blockSize, etc.)
 * - All crew with their shifts for the date
 * - All constraints (hourly, window, daily)
 * - All preferences (role preferences + crew opt-ins)
 * 
 * The output can be directly passed to the Python solver.
 */
export async function solverInputRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { storeId: string; date: string };
    Querystring: { lookbackDays?: string };
  }>('/solver/input/:storeId/:date', async (request, reply) => {
    const storeId = parseInt(request.params.storeId, 10);
    const date = new Date(request.params.date);
    const lookbackDays = parseInt(request.query.lookbackDays || '7', 10);

    if (isNaN(storeId) || isNaN(date.getTime())) {
      return reply.code(400).send({ error: 'Invalid storeId or date' });
    }

    try {
      // ===================================================================
      // STEP 1: Load Store
      // ===================================================================
      const store = await prisma.store.findUnique({
        where: { id: storeId },
      });

      if (!store) {
        return reply.code(404).send({ error: `Store ${storeId} not found` });
      }

      // ===================================================================
      // STEP 2: Load All Roles
      // ===================================================================
      const roles = await prisma.role.findMany({
        where: { storeId },
      });

      // ===================================================================
      // STEP 3: Load All Crew with Shifts for the Date
      // ===================================================================
      const crew = await prisma.crew.findMany({
        where: { storeId },
        include: {
          crewRoles: {
            include: {
              role: true,
            },
          },
          shifts: {
            where: {
              date,
            },
          },
        },
      });

      // Filter to only crew with shifts on this date
      const crewWithShifts = crew.filter(c => c.shifts.length > 0);

      // ===================================================================
      // STEP 4: Load Constraints
      // ===================================================================
      const hourlyConstraints = await prisma.hourlyRoleConstraint.findMany({
        where: {
          storeId,
          date,
        },
        include: {
          role: true,
        },
      });

      const windowConstraints = await prisma.windowRoleConstraint.findMany({
        where: {
          storeId,
          date,
        },
        include: {
          role: true,
        },
      });

      const dailyConstraints = await prisma.dailyRoleConstraint.findMany({
        where: {
          storeId,
          date,
        },
        include: {
          role: true,
          crew: true,
        },
      });

      // ===================================================================
      // STEP 5: Load Preferences
      // ===================================================================
      const rolePreferences = await prisma.rolePreference.findMany({
        where: { storeId },
        include: {
          role: true,
          crewPreferences: {
            where: {
              enabled: true,
              crewId: {
                in: crewWithShifts.map(c => c.id),
              },
            },
            include: {
              crew: true,
            },
          },
        },
      });

      // Calculate adaptive boosts for preferences
      const preferencesArray: PreferenceConfig[] = [];
      
      for (const rp of rolePreferences) {
        for (const cp of rp.crewPreferences) {
          // Calculate adaptive boost based on satisfaction history
          const adaptiveBoost = await calculateAdaptiveBoost(
            cp.crewId,
            rp.id,
            lookbackDays,
            date
          );

          preferencesArray.push({
            crewId: cp.crewId,
            roleCode: rp.role?.code || null,
            preferenceType: rp.preferenceType as PreferenceType,
            baseWeight: rp.baseWeight,
            crewWeight: cp.crewWeight,
            adaptiveBoost,
            intValue: cp.intValue || undefined,
            rolePreferenceId: rp.id,
          });
        }
      }

      // ===================================================================
      // STEP 6: Build SolverInput
      // ===================================================================

      // Role code mapping for legacy TaskType enum
      const roleCodeMap: Record<string, TaskType> = {
        'REGISTER': TaskType.REGISTER,
        'PRODUCT': TaskType.PRODUCT,
        'PARKING_HELM': TaskType.PARKING_HELM,
        'BREAK': TaskType.BREAK,
        'DEMO': TaskType.DEMO,
        'WINE_DEMO': TaskType.WINE_DEMO,
        'ART': TaskType.ART,
        'ORDER_WRITER': TaskType.ORDER_WRITER,
      };

      const solverInput: SolverInput = {
        date: date.toISOString().split('T')[0],
        storeId,
        baseSlotMinutes: store.baseSlotMinutes,
        timeLimitSeconds: 30, // 30 second time limit for testing
        storeMetadata: {
          openMinutesFromMidnight: store.openMinutesFromMidnight,
          closeMinutesFromMidnight: store.closeMinutesFromMidnight,
          startRegHour: store.openMinutesFromMidnight,
          endRegHour: store.closeMinutesFromMidnight,
          reqShiftLengthForBreak: store.reqShiftLengthForBreak,
          breakWindowStart: store.breakWindowStart,
          breakWindowEnd: store.breakWindowEnd,
        },
        crew: crewWithShifts.map((c) => {
          const shift = c.shifts[0];
          return {
            id: c.id,
            name: c.name,
            shiftStartMin: shift.startMin,
            shiftEndMin: shift.endMin,
            eligibleRoles: c.crewRoles.map((cr) => 
              roleCodeMap[cr.role.code] || cr.role.code as TaskType
            ),
            canBreak: true,
            canParkingHelms: c.crewRoles.some((cr) => cr.role.code === 'PARKING_HELM'),
          } as SolverCrewMember;
        }),
        preferences: preferencesArray,
        hourlyRequirements: buildHourlyRequirements(hourlyConstraints, roleCodeMap),
        crewRoleRequirements: dailyConstraints.map((c) => ({
          crewId: c.crewId,
          role: roleCodeMap[c.role.code] || c.role.code as TaskType,
          requiredHours: c.requiredHours,
        } as CrewRoleRequirement)),
        coverageWindows: windowConstraints.map((c) => ({
          role: roleCodeMap[c.role.code] || c.role.code as TaskType,
          startHour: c.startHour,
          endHour: c.endHour,
          requiredPerHour: c.requiredPerHour,
        } as CoverageWindow)),
        roleMetadata: roles.map((r) => {
          const isBreakRole = r.code === 'MEAL_BREAK' || r.code === 'BREAK';
          return {
            role: roleCodeMap[r.code] || r.code as TaskType,
            assignmentModel: r.assignmentModel as any,
            // Break roles must be allowed outside store hours for early/late shifts
            allowOutsideStoreHours: isBreakRole ? true : r.allowOutsideStoreHours,
            slotsMustBeConsecutive: r.slotsMustBeConsecutive,
            minSlots: r.minSlots,
            maxSlots: r.maxSlots,
            blockSize: r.blockSize,
            isConsecutive: r.slotsMustBeConsecutive,
            isUniversal: r.assignmentModel === 'HOURLY',
            isBreakRole,
            isParkingRole: false, // Deprecated - using minSlots/maxSlots instead
            detail: r.displayName,
          } as RoleMetadata;
        }),
      };

      return reply.send({
        success: true,
        data: solverInput,
        metadata: {
          storeId,
          storeName: store.name,
          date: date.toISOString().split('T')[0],
          crewCount: crewWithShifts.length,
          totalCrew: crew.length,
          crewWithoutShifts: crew.length - crewWithShifts.length,
          roleCount: roles.length,
          preferenceCount: preferencesArray.length,
          constraintCounts: {
            hourly: hourlyConstraints.length,
            window: windowConstraints.length,
            daily: dailyConstraints.length,
          },
        },
      });

    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ 
        error: 'Failed to build solver input', 
        message: error.message 
      });
    }
  });
}

/**
 * Build hourly requirements array by aggregating constraints by hour
 */
function buildHourlyRequirements(
  constraints: Array<{ hour: number; requiredPerHour: number; role: { code: string } }>,
  roleCodeMap: Record<string, TaskType>
): HourlyStaffingRequirement[] {
  const hourMap = new Map<number, HourlyStaffingRequirement>();

  for (const c of constraints) {
    if (!hourMap.has(c.hour)) {
      hourMap.set(c.hour, {
        hour: c.hour,
        requiredRegister: 0,
        requiredProduct: 0,
        requiredParkingHelm: 0,
      });
    }

    const req = hourMap.get(c.hour)!;
    
    if (c.role.code === 'REGISTER') {
      req.requiredRegister = c.requiredPerHour;
    } else if (c.role.code === 'PRODUCT') {
      req.requiredProduct = c.requiredPerHour;
    } else if (c.role.code === 'PARKING_HELM') {
      req.requiredParkingHelm = c.requiredPerHour;
    }
  }

  return Array.from(hourMap.values()).sort((a, b) => a.hour - b.hour);
}

/**
 * Calculate adaptive boost for a crew's preference based on recent satisfaction history
 */
async function calculateAdaptiveBoost(
  crewId: string,
  rolePreferenceId: number,
  lookbackDays: number,
  currentDate: Date
): Promise<number> {
  const lookbackDate = new Date(currentDate);
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

  const satisfactionRecords = await prisma.preferenceSatisfaction.findMany({
    where: {
      crewId,
      rolePreferenceId,
      date: {
        gte: lookbackDate,
        lt: currentDate,
      },
    },
    orderBy: {
      date: 'desc',
    },
  });

  if (satisfactionRecords.length === 0) {
    return 1.0; // No history, neutral boost
  }

  // Calculate satisfaction rate
  const metCount = satisfactionRecords.filter(r => r.met).length;
  const totalCount = satisfactionRecords.length;
  const satisfactionRate = metCount / totalCount;

  // Lower satisfaction = higher boost (fairness mechanism)
  // 0% satisfied → 3.0x boost
  // 50% satisfied → 2.0x boost
  // 100% satisfied → 1.0x boost (no boost)
  const boost = 1.0 + (2.0 * (1.0 - satisfactionRate));

  return Math.max(1.0, Math.min(3.0, boost)); // Clamp between 1.0 and 3.0
}
