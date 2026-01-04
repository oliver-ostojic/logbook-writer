/**
 * Role Fairness Service
 * 
 * Handles tracking and calculating fairness metrics for role distribution.
 * 
 * Key concepts:
 * - CrewRoleFairnessHistory: Daily record of minutes assigned per crew per role
 * - RoleFairnessSnapshot: Daily snapshot of fairness metrics per role
 * - Fairness is normalized by "days worked" to account for varying schedules
 * 
 * Fairness Index: 100 = perfect equality, 0 = max inequality
 * Based on Gini coefficient: gini=0 is perfect equality, gini=1 is max inequality
 * fairnessIndex = 100 * (1 - gini)
 */

import { PrismaClient } from '@prisma/client';

export interface AssignmentForFairness {
  crewId: string;
  roleId: number;
  startMinute: number;
  endMinute: number;
}

export interface FairnessUpdateOptions {
  storeId: number;
  date: Date;
  assignments: AssignmentForFairness[];
}

/**
 * Calculate Gini coefficient for an array of values.
 * Gini = 0 means perfect equality, Gini = 1 means max inequality.
 */
function calculateGini(values: number[]): number {
  if (values.length === 0) return 0;
  
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  
  if (total === 0) return 0; // Everyone has 0, so "equal"
  
  let sumOfDifferences = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumOfDifferences += Math.abs(sorted[i] - sorted[j]);
    }
  }
  
  return sumOfDifferences / (2 * n * total);
}

/**
 * Convert Gini coefficient to letter grade.
 */
function giniToGrade(gini: number): string {
  const fairnessIndex = 100 * (1 - gini);
  if (fairnessIndex >= 95) return 'A+';
  if (fairnessIndex >= 90) return 'A';
  if (fairnessIndex >= 85) return 'B+';
  if (fairnessIndex >= 80) return 'B';
  if (fairnessIndex >= 75) return 'C+';
  if (fairnessIndex >= 70) return 'C';
  if (fairnessIndex >= 60) return 'D';
  return 'F';
}

/**
 * Record daily fairness history for assignments.
 * Called after a logbook is saved to update CrewRoleFairnessHistory.
 * 
 * IMPORTANT: Deletes existing records for this date first to handle logbook regeneration.
 */
export async function recordDailyFairnessHistory(
  prisma: PrismaClient,
  options: FairnessUpdateOptions
): Promise<void> {
  const { storeId, date, assignments } = options;

  // Get roles that have fairness tracking enabled
  const trackedRoles = await prisma.roleFairnessTracker.findMany({
    where: { storeId, enabled: true },
    select: { roleId: true, lookbackDays: true },
  });

  const trackedRoleIds = new Set(trackedRoles.map(r => r.roleId));

  // Delete existing history for this date (to handle logbook regeneration)
  await prisma.crewRoleFairnessHistory.deleteMany({
    where: {
      storeId,
      date,
      roleId: { in: Array.from(trackedRoleIds) },
    },
  });

  // Calculate minutes per crew per role
  const minutesByCrewRole = new Map<string, number>(); // "crewId:roleId" -> minutes
  
  for (const assignment of assignments) {
    if (!trackedRoleIds.has(assignment.roleId)) continue;
    
    const key = `${assignment.crewId}:${assignment.roleId}`;
    const minutes = assignment.endMinute - assignment.startMinute;
    const current = minutesByCrewRole.get(key) ?? 0;
    minutesByCrewRole.set(key, current + minutes);
  }

  // Create new records for each crew-role combination
  const creates: Promise<unknown>[] = [];
  
  for (const [key, minutes] of minutesByCrewRole.entries()) {
    const [crewId, roleIdStr] = key.split(':');
    const roleId = parseInt(roleIdStr, 10);

    creates.push(
      prisma.crewRoleFairnessHistory.create({
        data: {
          storeId,
          roleId,
          crewId,
          date,
          minutesAssigned: minutes,
        },
      })
    );
  }

  await Promise.all(creates);
}

/**
 * Calculate and store fairness snapshot for tracked roles.
 * Uses lookback window to compute fairness metrics normalized by HOURS WORKED.
 */
export async function calculateAndStoreFairnessSnapshot(
  prisma: PrismaClient,
  options: { storeId: number; date: Date }
): Promise<void> {
  const { storeId, date } = options;

  // Get roles that have fairness tracking enabled
  const trackedRoles = await prisma.roleFairnessTracker.findMany({
    where: { storeId, enabled: true },
    select: { roleId: true, lookbackDays: true },
  });

  if (trackedRoles.length === 0) return;

  for (const tracker of trackedRoles) {
    const { roleId, lookbackDays } = tracker;

    // Calculate lookback window
    const windowStart = new Date(date);
    windowStart.setDate(windowStart.getDate() - lookbackDays);

    // Get all fairness history records in the lookback window
    const historyRecords = await prisma.crewRoleFairnessHistory.findMany({
      where: {
        storeId,
        roleId,
        date: {
          gte: windowStart,
          lte: date,
        },
      },
      select: {
        crewId: true,
        minutesAssigned: true,
        date: true,
      },
    });

    // Get shift history for all crew in the lookback window
    const shiftRecords = await prisma.shift.findMany({
      where: {
        storeId,
        date: {
          gte: windowStart,
          lte: date,
        },
      },
      select: {
        crewId: true,
        startMin: true,
        endMin: true,
      },
    });

    // Calculate total shift minutes per crew
    const totalShiftMinutesByCrew = new Map<string, number>();
    for (const shift of shiftRecords) {
      const shiftMinutes = shift.endMin - shift.startMin;
      const current = totalShiftMinutesByCrew.get(shift.crewId) ?? 0;
      totalShiftMinutesByCrew.set(shift.crewId, current + shiftMinutes);
    }

    // Get eligible crew (those who can do this role)
    const eligibleCrew = await prisma.crewRole.findMany({
      where: {
        roleId,
        Crew: { storeId },
      },
      select: { crewId: true },
    });

    const eligibleCrewIds = new Set(eligibleCrew.map(c => c.crewId));

    // Aggregate: total role minutes per crew
    const roleMinutesByCrew = new Map<string, number>();
    
    for (const record of historyRecords) {
      if (!eligibleCrewIds.has(record.crewId)) continue;
      const current = roleMinutesByCrew.get(record.crewId) ?? 0;
      roleMinutesByCrew.set(record.crewId, current + record.minutesAssigned);
    }

    // Calculate minutes per hour worked for each crew
    const minutesPerHour: number[] = [];
    
    for (const crewId of eligibleCrewIds) {
      const roleMinutes = roleMinutesByCrew.get(crewId) ?? 0;
      const totalShiftMinutes = totalShiftMinutesByCrew.get(crewId) ?? 0;
      const totalHoursWorked = totalShiftMinutes / 60;
      
      // If crew hasn't worked any shifts in lookback, treat as 0 min/hr
      const minPerHour = totalHoursWorked > 0 
        ? roleMinutes / totalHoursWorked 
        : 0;
      
      minutesPerHour.push(minPerHour);
    }

    // Calculate fairness metrics
    const gini = calculateGini(minutesPerHour);
    const fairnessIndex = 100 * (1 - gini);
    const grade = giniToGrade(gini);

    // Stats (now in minutes per hour instead of minutes per day)
    const minMph = minutesPerHour.length > 0 ? Math.min(...minutesPerHour) : 0;
    const maxMph = minutesPerHour.length > 0 ? Math.max(...minutesPerHour) : 0;
    const avgMph = minutesPerHour.length > 0 
      ? minutesPerHour.reduce((a, b) => a + b, 0) / minutesPerHour.length 
      : 0;
    
    const variance = minutesPerHour.length > 0
      ? minutesPerHour.reduce((sum, v) => sum + Math.pow(v - avgMph, 2), 0) / minutesPerHour.length
      : 0;
    const stdDev = Math.sqrt(variance);

    const crewWithMinutes = Array.from(roleMinutesByCrew.values()).filter(m => m > 0).length;

    // Upsert the snapshot
    await prisma.roleFairnessSnapshot.upsert({
      where: {
        storeId_roleId_date: {
          storeId,
          roleId,
          date,
        },
      },
      create: {
        storeId,
        roleId,
        date,
        giniCoefficient: gini,
        fairnessIndex,
        fairnessGrade: grade,
        minMinutesPerDay: minMph,  // Note: field name says "PerDay" but we're storing per-hour now
        maxMinutesPerDay: maxMph,
        avgMinutesPerDay: avgMph,
        stdDeviation: stdDev,
        eligibleCrew: eligibleCrewIds.size,
        crewWithMinutes,
        lookbackDays,
      },
      update: {
        giniCoefficient: gini,
        fairnessIndex,
        fairnessGrade: grade,
        minMinutesPerDay: minMph,
        maxMinutesPerDay: maxMph,
        avgMinutesPerDay: avgMph,
        stdDeviation: stdDev,
        eligibleCrew: eligibleCrewIds.size,
        crewWithMinutes,
        lookbackDays,
      },
    });
  }
}

/**
 * Combined function to update all fairness data after logbook save.
 */
export async function updateRoleFairnessData(
  prisma: PrismaClient,
  options: FairnessUpdateOptions
): Promise<void> {
  // Step 1: Record daily history
  await recordDailyFairnessHistory(prisma, options);

  // Step 2: Calculate and store snapshots
  await calculateAndStoreFairnessSnapshot(prisma, {
    storeId: options.storeId,
    date: options.date,
  });
}

/**
 * Get fairness snapshots for a role over time (for graphing).
 */
export async function getRoleFairnessHistory(
  prisma: PrismaClient,
  options: { storeId: number; roleId: number; days?: number }
): Promise<{
  roleId: number;
  snapshots: Array<{
    date: Date;
    fairnessIndex: number;
    fairnessGrade: string;
    giniCoefficient: number;
    avgMinutesPerDay: number;
    minMinutesPerDay: number;
    maxMinutesPerDay: number;
    eligibleCrew: number;
    crewWithMinutes: number;
  }>;
}> {
  const { storeId, roleId, days = 30 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const snapshots = await prisma.roleFairnessSnapshot.findMany({
    where: {
      storeId,
      roleId,
      date: { gte: startDate },
    },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      fairnessIndex: true,
      fairnessGrade: true,
      giniCoefficient: true,
      avgMinutesPerDay: true,
      minMinutesPerDay: true,
      maxMinutesPerDay: true,
      eligibleCrew: true,
      crewWithMinutes: true,
    },
  });

  return { roleId, snapshots };
}

/**
 * Get current crew distribution for a role (for detailed view).
 */
export async function getRoleCrewDistribution(
  prisma: PrismaClient,
  options: { storeId: number; roleId: number; lookbackDays?: number }
): Promise<{
  roleId: number;
  lookbackDays: number;
  crewDistribution: Array<{
    crewId: string;
    crewName: string;
    totalMinutes: number;
    daysWorked: number;
    minutesPerDay: number;
  }>;
}> {
  const { storeId, roleId, lookbackDays = 14 } = options;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  // Get history records
  const historyRecords = await prisma.crewRoleFairnessHistory.findMany({
    where: {
      storeId,
      roleId,
      date: { gte: startDate },
    },
    include: {
      Crew: { select: { name: true } },
    },
  });

  // Aggregate by crew
  const crewStats = new Map<string, { 
    name: string;
    totalMinutes: number; 
    daysWorked: number;
  }>();

  for (const record of historyRecords) {
    const stats = crewStats.get(record.crewId) ?? { 
      name: record.Crew.name,
      totalMinutes: 0, 
      daysWorked: 0 
    };
    stats.totalMinutes += record.minutesAssigned;
    stats.daysWorked += 1;
    crewStats.set(record.crewId, stats);
  }

  const distribution = Array.from(crewStats.entries()).map(([crewId, stats]) => ({
    crewId,
    crewName: stats.name,
    totalMinutes: stats.totalMinutes,
    daysWorked: stats.daysWorked,
    minutesPerDay: stats.daysWorked > 0 ? stats.totalMinutes / stats.daysWorked : 0,
  }));

  // Sort by minutes per day descending
  distribution.sort((a, b) => b.minutesPerDay - a.minutesPerDay);

  return { roleId, lookbackDays, crewDistribution: distribution };
}
