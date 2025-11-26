/**
 * Logbook Manager Service
 * 
 * Handles creation and update of Logbook records with complete metadata,
 * including solver statistics, preference satisfaction tracking, and assignments.
 */

import crypto from 'crypto';
import type { PrismaClient, LogbookStatus, RunStatus } from '@prisma/client';
import type { SolverOutput, SolverInput, SolverStatus, TaskAssignment } from '@logbook-writer/shared-types';
import {
  calculateAllSatisfaction,
  savePreferenceSatisfaction,
  saveLogPreferenceMetadata,
  type AssignmentRecord,
  type PreferenceRecord,
  type StoreBreakConfig
} from './preference-satisfaction';

export interface LogbookMetadata {
  solver: {
    status: string;
    runtimeMs: number;
    objectiveScore?: number;
    numCrew?: number;
    numHours?: number;
    numAssignments?: number;
  };
  schedule: {
    totalAssignments: number;
    crewScheduled: number;
    totalHours: number;
  };
  constraints: {
    hourlyConstraints: number;
    windowConstraints: number;
    dailyConstraints: number;
  };
  preferences: {
    total: number;
    met: number;
    averageSatisfaction: number;
  };
  generatedAt: string;
}

// Map SolverStatus to RunStatus
function solverStatusToRunStatus(status: SolverStatus): RunStatus {
  const mapping: Record<SolverStatus, RunStatus> = {
    OPTIMAL: 'OPTIMAL',
    FEASIBLE: 'FEASIBLE',
    INFEASIBLE: 'INFEASIBLE',
    TIME_LIMIT: 'TIME_LIMIT',
    ERROR: 'INFEASIBLE',
  };
  return mapping[status] || 'INFEASIBLE';
}

/**
 * Create or update a logbook with solver output and preference satisfaction
 */
export async function saveLogbookWithMetadata(
  prisma: PrismaClient,
  options: {
    storeId: number;
    date: Date;
    solverOutput: SolverOutput;
    solverInput: SolverInput;
    status: LogbookStatus;
  }
): Promise<string> {
  const { storeId, date, solverOutput, solverInput, status } = options;

  // Fetch store configuration for preference calculation
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      breakWindowStart: true,
      breakWindowEnd: true,
      reqShiftLengthForBreak: true,
    }
  });

  if (!store) {
    throw new Error(`Store ${storeId} not found`);
  }

  const storeConfig: StoreBreakConfig = {
    breakWindowStart: store.breakWindowStart,
    breakWindowEnd: store.breakWindowEnd,
    reqShiftLengthForBreak: store.reqShiftLengthForBreak,
  };

  // Get break role IDs
  const breakRoles = await prisma.role.findMany({
    where: { storeId, code: { in: ['BREAK', 'MEAL_BREAK'] } },
    select: { id: true }
  });
  const breakRoleIds = breakRoles.map(r => r.id);

  // Get role code to ID mapping
  const roles = await prisma.role.findMany({
    where: { storeId },
    select: { id: true, code: true }
  });
  const roleCodeToId = new Map(roles.map(r => [r.code, r.id]));

  // Guard: ensure assignments exist
  if (!solverOutput.assignments || solverOutput.assignments.length === 0) {
    throw new Error('Cannot save logbook: solver output has no assignments');
  }

  // Convert solver assignments to AssignmentRecord format
  const assignmentRecords: AssignmentRecord[] = solverOutput.assignments.map(a => {
    const roleId = roleCodeToId.get(a.taskType);
    if (!roleId) {
      throw new Error(`Unknown role code: ${a.taskType}`);
    }
    return {
      crewId: a.crewId,
      roleId,
      startMinutes: a.startTime,
      endMinutes: a.endTime,
    };
  });

  // Fetch RolePreferences with CrewPreferences to build PreferenceRecord array
  const rolePreferences = await prisma.rolePreference.findMany({
    where: { storeId },
    include: {
      crewPreferences: {
        where: { enabled: true }
      }
    }
  });

  const preferenceRecords: PreferenceRecord[] = [];
  for (const rp of rolePreferences) {
    for (const cp of rp.crewPreferences) {
      preferenceRecords.push({
        id: rp.id,
        crewId: cp.crewId,
        roleId: rp.roleId,
        preferenceType: rp.preferenceType,
        baseWeight: rp.baseWeight,
        crewWeight: cp.crewWeight,
        intValue: cp.intValue,
      });
    }
  }

  // Calculate preference satisfaction
  const satisfactionResults = await calculateAllSatisfaction(
    assignmentRecords,
    preferenceRecords,
    breakRoleIds,
    storeConfig
  );

  // Calculate aggregate preference stats
  const preferencesMet = satisfactionResults.filter(r => r.met).length;
  const totalWeightedSatisfaction = satisfactionResults.reduce(
    (sum, r) => sum + (r.satisfaction * r.weightApplied),
    0
  );
  const totalWeightApplied = satisfactionResults.reduce(
    (sum, r) => sum + r.weightApplied,
    0
  );
  const averageSatisfaction = totalWeightApplied > 0 
    ? totalWeightedSatisfaction / totalWeightApplied 
    : 0;

  // Count constraints
  const hourlyConstraintCount = await prisma.hourlyRoleConstraint.count({
    where: { storeId, date }
  });
  const windowConstraintCount = await prisma.windowRoleConstraint.count({
    where: { storeId, date }
  });
  const dailyConstraintCount = await prisma.dailyRoleConstraint.count({
    where: { storeId, date }
  });

  // Guard: ensure assignments exist
  const assignmentsList = solverOutput.assignments || [];
  
  // Calculate schedule stats
  const uniqueCrewIds = new Set(assignmentsList.map(a => a.crewId));
  const totalHours = assignmentsList.reduce(
    (sum, a) => sum + ((a.endTime - a.startTime) / 60),
    0
  );

  // Build metadata object
  const metadata: LogbookMetadata = {
    solver: {
      status: solverOutput.metadata.status,
      runtimeMs: solverOutput.metadata.runtimeMs,
      objectiveScore: solverOutput.metadata.objectiveScore,
      numCrew: solverOutput.metadata.numCrew,
      numHours: solverOutput.metadata.numHours,
      numAssignments: solverOutput.metadata.numAssignments,
    },
    schedule: {
      totalAssignments: solverOutput.metadata.numAssignments,
      crewScheduled: uniqueCrewIds.size,
      totalHours: Math.round(totalHours * 10) / 10,
    },
    constraints: {
      hourlyConstraints: hourlyConstraintCount,
      windowConstraints: windowConstraintCount,
      dailyConstraints: dailyConstraintCount,
    },
    preferences: {
      total: satisfactionResults.length,
      met: preferencesMet,
      averageSatisfaction: Math.round(averageSatisfaction * 1000) / 1000,
    },
    generatedAt: new Date().toISOString(),
  };

  // Find or create logbook
  let logbook = await prisma.logbook.findFirst({
    where: { storeId, date, status },
    orderBy: { createdAt: 'desc' },
  });

  if (logbook) {
    // Update existing logbook
    logbook = await prisma.logbook.update({
      where: { id: logbook.id },
      data: {
        metadata: metadata as any,
        generatedAt: new Date(),
        updatedAt: new Date(),
      }
    });
  } else {
    // Create new logbook
    logbook = await prisma.logbook.create({
      data: {
        id: crypto.randomUUID(),
        storeId,
        date,
        status,
        generatedAt: new Date(),
        metadata: metadata as any,
      }
    });
  }

  // Delete existing assignments and satisfaction records for this logbook
  await prisma.assignment.deleteMany({ where: { logbookId: logbook.id } });
  await prisma.preferenceSatisfaction.deleteMany({ where: { logbookId: logbook.id } });
  await prisma.logPreferenceMetadata.deleteMany({ where: { logbookId: logbook.id } });

  // Create assignments (guard against undefined)
  const assignmentsToSave = solverOutput.assignments || [];
  const assignmentData = assignmentsToSave.map(a => {
    const roleId = roleCodeToId.get(a.taskType);
    if (!roleId) {
      throw new Error(`Unknown role code: ${a.taskType}`);
    }

    // Convert minutes from midnight to datetime
    const startDate = new Date(date);
    startDate.setHours(0, a.startTime, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(0, a.endTime, 0, 0);

    return {
      id: crypto.randomUUID(),
      logbookId: logbook.id,
      crewId: a.crewId,
      roleId,
      startTime: startDate,
      endTime: endDate,
      origin: 'ENGINE' as const,
      locked: false,
    };
  });

  await prisma.assignment.createMany({ data: assignmentData });

  // Save preference satisfaction records
  await savePreferenceSatisfaction(
    prisma,
    logbook.id,
    date,
    satisfactionResults
  );

  // Save log preference metadata
  await saveLogPreferenceMetadata(
    prisma,
    logbook.id,
    satisfactionResults
  );

  console.log('\n✅ Logbook saved successfully:');
  console.log(`   ID: ${logbook.id}`);
  console.log(`   Status: ${status}`);
  console.log(`   Assignments: ${assignmentData.length}`);
  console.log(`   Preferences tracked: ${satisfactionResults.length}`);
  console.log(`   Average satisfaction: ${(averageSatisfaction * 100).toFixed(1)}%\n`);

  return logbook.id;
}

/**
 * Create a Run record for tracking solver execution
 */
export async function createRunRecord(
  prisma: PrismaClient,
  options: {
    storeId: number;
    date: Date;
    engine: string;
    seed: number;
    solverOutput: SolverOutput;
    logbookId?: string;
  }
): Promise<string> {
  const { storeId, date, engine, seed, solverOutput, logbookId } = options;

  const run = await prisma.run.create({
    data: {
      id: crypto.randomUUID(),
      storeId,
      date,
      engine,
      seed,
      status: solverStatusToRunStatus(solverOutput.metadata.status),
      runtimeMs: solverOutput.metadata.runtimeMs,
      violations: solverOutput.metadata.violations || [],
      objectiveScore: solverOutput.metadata.objectiveScore || 0,
      mipGap: solverOutput.metadata.mipGap,
      logbookId,
    }
  });

  return run.id;
}

/**
 * Get logbook with all related data
 */
export async function getLogbookWithDetails(
  prisma: PrismaClient,
  logbookId: string
) {
  return await prisma.logbook.findUnique({
    where: { id: logbookId },
    include: {
      assignments: {
        include: {
          role: true,
          crew: true,
        }
      },
      preferenceSatisfactions: {
        include: {
          rolePreference: {
            include: {
              role: true,
            }
          },
          crew: true,
        }
      },
      preferenceMetadata: true,
      runs: true,
    }
  });
}
