/**
 * Dashboard API Routes
 *
 * Provides endpoints for the fairness dashboard frontend.
 */

import { FastifyInstance } from 'fastify';
import { generateDashboardData } from '../services/dashboard.service';
import { rbacMiddleware } from '../middleware/rbac';

export function registerDashboardRoutes(app: FastifyInstance) {
  /**
   * GET /api/stores/:storeId/dashboard
   *
   * Fetches dashboard data for a store within a date range.
   * Query params:
   *   - startDate: ISO date string (e.g., '2025-12-01')
   *   - endDate: ISO date string (e.g., '2025-12-07')
   *   - title: Optional dashboard title
   */
  app.get<{
    Params: { storeId: string };
    Querystring: { startDate?: string; endDate?: string; title?: string };
  }>('/api/stores/:storeId/dashboard', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (request, reply) => {
    const storeId = parseInt(request.params.storeId, 10);

    if (isNaN(storeId)) {
      return reply.status(400).send({ error: 'Invalid storeId' });
    }

    // Default to last 7 days if no dates provided
    const endDate = request.query.endDate
      ? new Date(request.query.endDate)
      : new Date();

    const startDate = request.query.startDate
      ? new Date(request.query.startDate)
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const title = request.query.title || 'Fairness Dashboard';

    try {
      const dashboardData = await generateDashboardData({
        storeId,
        startDate,
        endDate,
        title,
      });

      return reply.send(dashboardData);
    } catch (error) {
      console.error('Error generating dashboard data:', error);
      return reply.status(500).send({
        error: 'Failed to generate dashboard data',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/stores/:storeId/dashboard/dates
   *
   * Get available logbook dates for a store (for date picker)
   */
  app.get<{
    Params: { storeId: string };
  }>('/api/stores/:storeId/dashboard/dates', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (request, reply) => {
    const storeId = parseInt(request.params.storeId, 10);

    if (isNaN(storeId)) {
      return reply.status(400).send({ error: 'Invalid storeId' });
    }

    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const logbooks = await prisma.logbook.findMany({
        where: { storeId },
        select: { date: true },
        orderBy: { date: 'desc' },
        distinct: ['date'],
      });

      await prisma.$disconnect();

      const dates = logbooks.map(l => l.date.toISOString().split('T')[0]);

      return reply.send({ dates });
    } catch (error) {
      console.error('Error fetching dashboard dates:', error);
      return reply.status(500).send({
        error: 'Failed to fetch dashboard dates',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/stores/:storeId/dashboard/logbooks
   *
   * Fetch detailed logbook data for dashboard snapshot generation.
   * Returns data in LogbookInput format expected by buildDashboardSnapshot.
   *
   * Query params:
   *   - dates: Comma-separated ISO dates (e.g., '2025-01-01,2025-01-03,2025-01-07')
   *   - status: Comma-separated statuses to include (default: DRAFT,PUBLISHED — excludes SUPERSEDED)
   */
  app.get<{
    Params: { storeId: string };
    Querystring: { dates?: string; status?: string };
  }>('/api/stores/:storeId/dashboard/logbooks', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (request, reply) => {
    const storeId = parseInt(request.params.storeId, 10);

    if (isNaN(storeId)) {
      return reply.status(400).send({ error: 'Invalid storeId' });
    }

    const datesParam = request.query.dates;
    if (!datesParam) {
      return reply.status(400).send({ error: 'Missing required parameter: dates' });
    }

    // Parse dates
    const requestedDates = datesParam.split(',').map(d => d.trim());

    // Validate date format
    for (const date of requestedDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.status(400).send({
          error: `Invalid date format: ${date}. Expected YYYY-MM-DD`
        });
      }
    }

    const statusParam = request.query.status || 'DRAFT,PUBLISHED';
    const statuses = statusParam.split(',').map(s => s.trim()) as any[];

    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      // Convert ISO date strings to Date objects
      const dateObjects = requestedDates.map(dateStr => {
        const date = new Date(dateStr + 'T00:00:00.000Z');
        return date;
      });

      // Fetch logbooks with all required relations
      const logbooks = await prisma.logbook.findMany({
        where: {
          storeId,
          date: { in: dateObjects },
          status: { in: statuses },
        },
        include: {
          Assignment: {
            include: {
              Crew: { select: { id: true, name: true } },
              Role: { select: { id: true, code: true, displayName: true, taskLength: true } },
            },
          },
          LogPreferenceMetadata: true,
        },
        orderBy: { date: 'asc' },
      });

      // Fetch roles with fairness tracking info
      const roles = await prisma.role.findMany({
        where: { storeId },
        include: {
          RoleFairnessTracker: true,
        },
      });

      // Fetch role rules for preference sentence generation
      const roleRules = await prisma.roleRule.findMany({
        where: {
          Role: { storeId },
        },
        select: {
          id: true,
          type: true,
          constraintType: true,
          description: true,
          Role: { select: { id: true, code: true, displayName: true } },
          TargetRole: { select: { id: true, code: true, displayName: true } },
        },
      });

      // Fetch role fairness snapshots for the requested dates
      const roleFairnessSnapshots = await prisma.roleFairnessSnapshot.findMany({
        where: {
          storeId,
          date: { in: dateObjects },
        },
      });

      // Transform to LogbookInput format
      const transformedLogbooks = logbooks.map(logbook => {
        const logbookDateStr = logbook.date.toISOString().split('T')[0];

        // Group assignments by crew
        const crewMap = new Map<string, {
          crewId: string;
          crewName: string;
          assignments: any[];
        }>();

        for (const assignment of (logbook as any).Assignment) {
          const crewId = assignment.crewId;

          if (!crewMap.has(crewId)) {
            crewMap.set(crewId, {
              crewId,
              crewName: assignment.Crew.name,
              assignments: [],
            });
          }

          const crew = crewMap.get(crewId)!;

          crew.assignments.push({
            assignmentId: assignment.id,
            roleId: assignment.roleId.toString(),
            roleName: assignment.Role.code,
            startTime: assignment.startTime.toISOString(),
            endTime: assignment.endTime.toISOString(),
          });
        }

        // Build crew array with preference stats from LogPreferenceMetadata breakdownByCrew
        const metadata = (logbook as any).LogPreferenceMetadata;
        const breakdownByCrew = Array.isArray(metadata?.breakdownByCrew)
          ? (metadata.breakdownByCrew as any[])
          : [];
        const breakdownByCrewAndRuleType = Array.isArray(metadata?.breakdownByCrewAndRuleType)
          ? (metadata.breakdownByCrewAndRuleType as any[])
          : [];

        const crewArray = Array.from(crewMap.values()).map(crew => {
          // Find this crew's satisfaction stats from breakdownByCrew
          const crewStats = breakdownByCrew.find(c => c.crewId === crew.crewId);
          
          // Find this crew's per-rule-type breakdown
          const crewRuleTypeBreakdown = breakdownByCrewAndRuleType
            .filter(b => b.crewId === crew.crewId)
            .map(b => ({
              ruleType: b.ruleType,
              total: b.total,
              met: b.met,
              percentMet: b.percentMet,
            }));

          return {
            crewId: crew.crewId,
            crewName: crew.crewName,
            assignments: crew.assignments,
            preferences: {
              total: crewStats?.total || 0,
              met: crewStats?.met || 0,
              satisfaction: crewStats?.avgSatisfaction || 0,
              breakdownByRuleType: crewRuleTypeBreakdown,
            },
          };
        });

        // Extract aggregate stats from LogPreferenceMetadata
        const aggregateStats = metadata
          ? {
              eligiblePreferences: metadata.eligiblePreferences,
              preferencesMet: metadata.preferencesMet,
              percentMet: metadata.percentMet,
              avgSatisfaction: metadata.avgSatisfaction,
              avgSatisfactionPerCrew: metadata.avgSatisfactionPerCrew,
              eligibleCrew: metadata.eligibleCrew,
              fairnessIndex: metadata.fairnessIndex,
              fairnessGrade: metadata.fairnessGrade,
              breakdownByRoleRule: Array.isArray(metadata.breakdownByRoleRule)
                ? (metadata.breakdownByRoleRule as any[])
                : [],
            }
          : {
              eligiblePreferences: 0,
              preferencesMet: 0,
              percentMet: 0,
              avgSatisfaction: 0,
              avgSatisfactionPerCrew: 0,
              eligibleCrew: 0,
              fairnessIndex: 0,
              fairnessGrade: 'F',
              breakdownByRoleRule: [],
            };

        // Get fairness snapshots for this date
        const snapshotsForDate = roleFairnessSnapshots.filter(
          snap => snap.date.toISOString().split('T')[0] === logbookDateStr
        );

        const fairnessSnapshotsArray = snapshotsForDate.map(snap => ({
          roleId: snap.roleId.toString(),
          giniCoefficient: snap.giniCoefficient,
          fairnessIndex: snap.fairnessIndex,
          fairnessGrade: snap.fairnessGrade,
          minMinutesPerDay: snap.minMinutesPerDay,
          maxMinutesPerDay: snap.maxMinutesPerDay,
          avgMinutesPerDay: snap.avgMinutesPerDay,
          stdDeviation: snap.stdDeviation,
          eligibleCrew: snap.eligibleCrew,
          crewWithMinutes: snap.crewWithMinutes,
          lookbackDays: snap.lookbackDays,
        }));

        return {
          logbookId: logbook.id,
          date: logbookDateStr,
          storeId: logbook.storeId.toString(),
          crew: crewArray,
          roles: roles.map(role => ({
            roleId: role.id.toString(),
            roleName: role.displayName,
            isEnforced: role.RoleFairnessTracker?.enabled || false,
          })),
          aggregateStats,
          roleFairnessSnapshots: fairnessSnapshotsArray,
        };
      });

      await prisma.$disconnect();

      // Transform role rules for frontend
      const transformedRoleRules = roleRules.map(rule => ({
        roleRuleId: rule.id,
        roleId: rule.Role.id,
        roleName: rule.Role.displayName,
        roleCode: rule.Role.code,
        type: rule.type,
        targetRoleId: rule.TargetRole?.id || null,
        targetRoleName: rule.TargetRole?.displayName || null,
        targetRoleCode: rule.TargetRole?.code || null,
        constraintType: rule.constraintType,
        description: rule.description,
      }));

      return reply.send({
        logbooks: transformedLogbooks,
        roleRules: transformedRoleRules,
      });
    } catch (error) {
      console.error('Error fetching detailed logbooks:', error);
      return reply.status(500).send({
        error: 'Failed to fetch detailed logbooks',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get all role rules for a store (for manual description creation)
  app.get('/api/stores/:storeId/dashboard/role-rules', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (request, reply) => {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();

      const { storeId } = request.params as { storeId: string };

      const roleRules = await prisma.roleRule.findMany({
        where: {
          Role: { storeId: parseInt(storeId, 10) },
        },
        include: {
          Role: { select: { id: true, code: true, displayName: true } },
          TargetRole: { select: { id: true, code: true, displayName: true } },
        },
        orderBy: { id: 'asc' },
      });

      const formatted = roleRules.map(rule => ({
        roleRuleId: rule.id,
        roleName: rule.Role.displayName,
        targetRoleName: rule.TargetRole?.displayName || null,
        type: rule.type,
        constraintType: rule.constraintType,
      }));

      await prisma.$disconnect();

      return reply.send({ roleRules: formatted });
    } catch (error) {
      console.error('Error fetching role rules:', error);
      return reply.status(500).send({
        error: 'Failed to fetch role rules',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
