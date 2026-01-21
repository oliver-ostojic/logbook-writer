/**
 * Activity API Routes
 *
 * Provides endpoints for activity logs and comments.
 */

import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { rbacMiddleware, getUser } from '../middleware/rbac';
import { logComment, getActivityLogs } from '../services/activity-logger';

const prisma = new PrismaClient();

type DateFilter = 'recent' | 'today' | 'last2days' | 'oneweek' | 'onemonth';

function getDateFilterStart(filter: DateFilter): Date | null {
  if (filter === 'recent') {
    return null; // No date filter, just use limit
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  switch (filter) {
    case 'today':
      return now;
    case 'last2days':
      return new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    case 'oneweek':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'onemonth':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return now;
  }
}

export function registerActivityRoutes(app: FastifyInstance) {
  /**
   * GET /api/stores/:storeId/activity
   *
   * Fetches activity logs for a store with optional date filtering.
   * Query params:
   *   - filter: 'recent' | 'today' | 'last2days' | 'oneweek' | 'onemonth' (default: 'recent')
   *   - date: YYYY-MM-DD (optional, filters by specific logbook date)
   *   - limit: number (default: 20 for 'recent', 50 for others)
   *   - offset: number (default: 0)
   */
  app.get<{
    Params: { storeId: string };
    Querystring: { filter?: DateFilter; date?: string; limit?: string; offset?: string };
  }>(
    '/api/stores/:storeId/activity',
    {
      preHandler: rbacMiddleware({
        allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'],
        requireStoreAccess: true,
      }),
    },
    async (request, reply) => {
      const storeId = parseInt(request.params.storeId, 10);

      if (isNaN(storeId)) {
        return reply.status(400).send({ error: 'Invalid storeId' });
      }

      const filter = (request.query.filter || 'recent') as DateFilter;
      const specificDate = request.query.date; // YYYY-MM-DD format
      const defaultLimit = filter === 'recent' ? 20 : 50;
      const limit = Math.min(parseInt(request.query.limit || String(defaultLimit), 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);

      // Build where clause based on whether a specific date is provided
      let whereClause: { storeId: number; date?: Date; createdAt?: { gte: Date } };

      if (specificDate) {
        // Filter by specific logbook date (the date field on activity logs)
        const dateObj = new Date(specificDate + 'T00:00:00.000Z');
        whereClause = {
          storeId,
          date: dateObj,
        };
      } else {
        // Use the time-based filter (createdAt)
        const filterStart = getDateFilterStart(filter);
        if (filterStart) {
          whereClause = {
            storeId,
            createdAt: { gte: filterStart },
          };
        } else {
          // 'recent' filter - no date constraint
          whereClause = { storeId };
        }
      }

      try {
        const [logs, total] = await Promise.all([
          prisma.activityLog.findMany({
            where: whereClause,
            include: {
              User: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
            skip: offset,
          }),
          prisma.activityLog.count({
            where: whereClause,
          }),
        ]);

        return reply.send({ logs, total });
      } catch (error) {
        console.error('Error fetching activity logs:', error);
        return reply.status(500).send({
          error: 'Failed to fetch activity logs',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/stores/:storeId/activity/comment
   *
   * Add a user comment to the activity log.
   * Body:
   *   - comment: string (required)
   */
  app.post<{
    Params: { storeId: string };
    Body: { comment: string };
  }>(
    '/api/stores/:storeId/activity/comment',
    {
      preHandler: rbacMiddleware({
        allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'],
        requireStoreAccess: true,
      }),
    },
    async (request, reply) => {
      const storeId = parseInt(request.params.storeId, 10);

      if (isNaN(storeId)) {
        return reply.status(400).send({ error: 'Invalid storeId' });
      }

      const { comment } = request.body;

      if (!comment || typeof comment !== 'string' || !comment.trim()) {
        return reply.status(400).send({ error: 'Comment is required' });
      }

      const user = getUser(request);
      if (!user) {
        return reply.status(401).send({ error: 'User not found' });
      }

      try {
        // Log the comment
        await logComment(user.id, storeId, comment.trim());

        // Fetch the newly created log to return it
        const log = await prisma.activityLog.findFirst({
          where: {
            userId: user.id,
            storeId,
            action: 'comment',
          },
          include: {
            User: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        return reply.send({ success: true, log });
      } catch (error) {
        console.error('Error posting comment:', error);
        return reply.status(500).send({
          error: 'Failed to post comment',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /api/stores/:storeId/activity/:logId
   *
   * Soft-delete a comment by marking it as deleted.
   * Only the user who created the comment can delete it.
   */
  app.delete<{
    Params: { storeId: string; logId: string };
  }>(
    '/api/stores/:storeId/activity/:logId',
    {
      preHandler: rbacMiddleware({
        allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'],
        requireStoreAccess: true,
      }),
    },
    async (request, reply) => {
      const storeId = parseInt(request.params.storeId, 10);
      const logId = request.params.logId;

      if (isNaN(storeId)) {
        return reply.status(400).send({ error: 'Invalid storeId' });
      }

      const user = getUser(request);
      if (!user) {
        return reply.status(401).send({ error: 'User not found' });
      }

      try {
        // Find the activity log
        const log = await prisma.activityLog.findUnique({
          where: { id: logId },
        });

        if (!log) {
          return reply.status(404).send({ error: 'Activity log not found' });
        }

        // Verify this is a comment and belongs to the store
        if (log.action !== 'comment') {
          return reply.status(400).send({ error: 'Only comments can be deleted' });
        }

        if (log.storeId !== storeId) {
          return reply.status(403).send({ error: 'Access denied' });
        }

        // Only the owner can delete their comment
        if (log.userId !== user.id) {
          return reply.status(403).send({ error: 'You can only delete your own comments' });
        }

        // Soft-delete by updating metadata to mark as deleted
        const updatedLog = await prisma.activityLog.update({
          where: { id: logId },
          data: {
            metadata: {
              ...(log.metadata as object || {}),
              deleted: true,
              deletedAt: new Date().toISOString(),
              deletedBy: user.id,
            },
          },
          include: {
            User: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
        });

        return reply.send({ success: true, log: updatedLog });
      } catch (error) {
        console.error('Error deleting comment:', error);
        return reply.status(500).send({
          error: 'Failed to delete comment',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
