import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Activity action types
export type ActivityAction =
  | 'shifts_save'
  | 'constraints_save'
  | 'solver_run'
  | 'logbook_publish'
  | 'assignment_edit'
  | 'crew_create'
  | 'crew_update'
  | 'crew_delete'
  | 'user_create'
  | 'user_update'
  | 'user_delete'
  | 'login'
  | 'logout';

// Resource types
export type ResourceType =
  | 'Shift'
  | 'Logbook'
  | 'Constraint'
  | 'Assignment'
  | 'Crew'
  | 'User'
  | 'Run';

export interface LogActivityParams {
  userId: string;
  action: ActivityAction;
  resourceType: ResourceType;
  resourceId?: string;
  storeId?: number;
  date?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Log an activity to the ActivityLog table
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  const { userId, action, resourceType, resourceId, storeId, date, metadata } = params;

  try {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        resourceType,
        resourceId: resourceId || null,
        storeId: storeId || null,
        date: date || null,
        metadata: metadata || undefined,
      },
    });
  } catch (error) {
    // Log error but don't fail the main operation
    console.error('Failed to log activity:', error);
  }
}

/**
 * Log shift save activity
 */
export async function logShiftsSave(
  userId: string,
  storeId: number,
  date: Date,
  metadata?: { shiftCount?: number; crewIds?: string[] }
): Promise<void> {
  await logActivity({
    userId,
    action: 'shifts_save',
    resourceType: 'Shift',
    storeId,
    date,
    metadata,
  });
}

/**
 * Log constraints save activity
 */
export async function logConstraintsSave(
  userId: string,
  storeId: number,
  date: Date,
  metadata?: { constraintTypes?: string[] }
): Promise<void> {
  await logActivity({
    userId,
    action: 'constraints_save',
    resourceType: 'Constraint',
    storeId,
    date,
    metadata,
  });
}

/**
 * Log solver run activity
 */
export async function logSolverRun(
  userId: string,
  storeId: number,
  date: Date,
  metadata?: { runId?: string; duration?: number; status?: string }
): Promise<void> {
  await logActivity({
    userId,
    action: 'solver_run',
    resourceType: 'Run',
    resourceId: metadata?.runId,
    storeId,
    date,
    metadata,
  });
}

/**
 * Log logbook publish activity
 */
export async function logLogbookPublish(
  userId: string,
  logbookId: number,
  storeId: number,
  date: Date,
  metadata?: { previousStatus?: string }
): Promise<void> {
  await logActivity({
    userId,
    action: 'logbook_publish',
    resourceType: 'Logbook',
    resourceId: String(logbookId),
    storeId,
    date,
    metadata,
  });
}

/**
 * Log assignment edit activity
 */
export async function logAssignmentEdit(
  userId: string,
  logbookId: number,
  storeId: number,
  metadata?: { assignmentIds?: number[]; changeCount?: number }
): Promise<void> {
  await logActivity({
    userId,
    action: 'assignment_edit',
    resourceType: 'Assignment',
    resourceId: String(logbookId),
    storeId,
    metadata,
  });
}

/**
 * Get activity logs for a store
 */
export async function getActivityLogs(params: {
  storeId?: number;
  userId?: string;
  action?: ActivityAction;
  limit?: number;
  offset?: number;
}) {
  const { storeId, userId, action, limit = 50, offset = 0 } = params;

  const where: Record<string, unknown> = {};
  if (storeId) where.storeId = storeId;
  if (userId) where.userId = userId;
  if (action) where.action = action;

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        User: {
          select: {
            id: true,
            username: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return { logs, total };
}
