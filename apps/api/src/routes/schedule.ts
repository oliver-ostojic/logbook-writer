import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startOfDay, hourOf, clamp } from '../utils';
import { type Shift } from '../services/demo-window';
import { segmentShiftByRegisterWindow, hhmmToMin, minToHHMM } from '../services/segmentation';
import {
  calculateCrewRuleSatisfaction,
  aggregateSatisfactionStats,
  saveLogPreferenceMetadata,
  type AssignmentRecord,
  type CrewRoleRuleRecord,
  type CrewShiftWindow,
} from '../services/crew-rule-satisfaction';
import { rbacMiddleware, getUser } from '../middleware/rbac';
import { logLogbookPublish, logLogbookPublishWithEdits } from '../services/activity-logger';

// Import enums using require for runtime access
const { LogbookStatus } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Recalculate and save preference satisfaction metadata for a logbook
 * Call this after any assignment changes to keep stats up-to-date
 */
async function recalculateLogbookSatisfaction(logbookId: string): Promise<void> {
  // Get the logbook with its assignments
  const logbook = await prisma.logbook.findUnique({
    where: { id: logbookId },
    include: {
      Assignment: {
        include: { Role: true }
      }
    }
  });

  if (!logbook) return;

  // Get shifts for the logbook's date/store
  const shifts = await prisma.shift.findMany({
    where: {
      storeId: logbook.storeId,
      date: logbook.date
    }
  });

  // Build crew shifts map
  const crewShifts = new Map<string, CrewShiftWindow>();
  for (const shift of shifts) {
    crewShifts.set(shift.crewId, {
      crewId: shift.crewId,
      shiftStartMin: shift.startMin,
      shiftEndMin: shift.endMin,
    });
  }

  // Get all crew who have assignments in this logbook
  const crewIds = [...new Set(logbook.Assignment.map(a => a.crewId))];

  // Get CrewRoleRules for these crew
  const crewRoleRules = await prisma.crewRoleRule.findMany({
    where: { crewId: { in: crewIds } },
    include: {
      RoleRule: true,
      Crew: true
    }
  });

  if (crewRoleRules.length === 0) {
    // No rules to evaluate - set empty metadata
    await saveLogPreferenceMetadata(prisma, logbookId, {
      eligiblePreferences: 0,
      preferencesMet: 0,
      percentMet: 0,
      avgSatisfaction: 0,
      eligibleCrew: 0,
      avgSatisfactionPerCrew: 0,
      fairnessIndex: 100,
      fairnessGrade: 'A+',
      breakdownByRoleRule: [],
    });
    return;
  }

  // Get role block sizes
  const roles = await prisma.role.findMany({
    where: { storeId: logbook.storeId },
    select: { id: true, taskLength: true }
  });
  const roleBlockSizes = new Map<number, number>();
  for (const role of roles) {
    roleBlockSizes.set(role.id, role.taskLength);
  }

  // Transform assignments to AssignmentRecord format
  const assignments: AssignmentRecord[] = logbook.Assignment.map(a => ({
    crewId: a.crewId,
    roleId: a.roleId,
    startMinutes: a.startTime.getUTCHours() * 60 + a.startTime.getUTCMinutes(),
    endMinutes: a.endTime.getUTCHours() * 60 + a.endTime.getUTCMinutes(),
  }));

  // Transform CrewRoleRules
  const crewRoleRuleRecords: CrewRoleRuleRecord[] = crewRoleRules.map(crr => ({
    id: crr.id,
    crewId: crr.crewId,
    roleRuleId: crr.roleRuleId,
    valueInt: crr.valueInt,
    roleRule: {
      id: crr.RoleRule.id,
      roleId: crr.RoleRule.roleId,
      type: crr.RoleRule.type,
      targetRoleId: crr.RoleRule.targetRoleId,
      constraintType: crr.RoleRule.constraintType,
    }
  }));

  // Calculate satisfaction
  const results = calculateCrewRuleSatisfaction(
    crewRoleRuleRecords,
    assignments,
    crewShifts,
    roleBlockSizes
  );

  // Aggregate stats
  const stats = aggregateSatisfactionStats(results, crewRoleRuleRecords);

  // Save to database
  await saveLogPreferenceMetadata(prisma, logbookId, stats);
}

type RunBody = {
  date: string;
  store_id: number;
  shifts: Shift[];
};

export function registerScheduleRoutes(app: FastifyInstance) {
  // Run scheduler (stub engine v0)
  app.post<{ Body: RunBody }>('/schedule/run', async (req, reply) => {
    const { date, store_id, shifts } = req.body;
    const day = startOfDay(new Date(date));

    // Load store register window defaults
    const storeAny = (await prisma.store.findUnique({ where: { id: store_id } })) as any;
    const regStartMin = (storeAny?.regHoursStartMin ?? 480) as number; // 08:00
    const regEndMin = (storeAny?.regHoursEndMin ?? 1260) as number;    // 21:00

    // Load requirements & coverage from wizard steps (new schema)
    const crewQuotas = await prisma.crewRoleQuota.findMany({ 
      where: { date: day, storeId: store_id }
    });
    const coverageWindows = await prisma.roleCoverageWindow.findMany({ 
      where: { date: day, storeId: store_id }
    });

    // Normalize shifts and compute PRODUCT/FLEX segmentation per crew
    const normalizedShifts = shifts.map(s => ({
      crewId: s.crewId,
      start: `${clamp(hourOf(s.start), 0, 23).toString().padStart(2,'0')}:00`,
      end: `${clamp(hourOf(s.end), 0, 24).toString().padStart(2,'0')}:00`,
    }));

    const segmentedShifts = normalizedShifts.map(s => {
      const startMin = hhmmToMin(s.start);
      const endMin = hhmmToMin(s.end);
      const seg = segmentShiftByRegisterWindow(startMin, endMin, regStartMin, regEndMin);
      return {
        crewId: s.crewId,
        shift: { start: s.start, end: s.end },
        segments: seg.segments.map(x => ({ 
          start: minToHHMM(x.startMin), 
          end: minToHHMM(x.endMin), 
          kind: x.kind 
        })),
        productMinutes: seg.productMinutes,
        flexMinutes: seg.flexMinutes,
      };
    });

    // --- Engine placeholder ---
    // TODO: pass segmentedShifts + requirements + coverages to real engine
    // Engine will allocate FLEX time to REGISTER/roles/breaks based on requirements/coverages
    
    // For now: ensure a single DRAFT logbook exists per (storeId, date), then return stub metrics.
    let logbook = await prisma.logbook.findFirst({
      where: { date: day, storeId: store_id, status: LogbookStatus.DRAFT },
      orderBy: { createdAt: 'desc' },
    });
    if (!logbook) {
      logbook = await prisma.logbook.create({
        data: {
          id: crypto.randomUUID(),
          date: day,
          storeId: store_id,
          status: LogbookStatus.DRAFT,
          generatedAt: new Date(),
        },
      });
    }

    const run = await prisma.run.create({
      data: {
        id: crypto.randomUUID(),
        date: day,
        storeId: store_id,
        engine: 'greedy-v0',
        seed: 0,
        status: 'FEASIBLE',
        runtimeMs: 1,
        violations: [],
        logbookId: logbook.id,
      }
    });

    // TODO: replace with real assignments using segmentedShifts/crewQuotas/coverageWindows
    // For now return stub metrics + segmentation summary for debugging
    const totalProductMin = segmentedShifts.reduce((a, s) => a + s.productMinutes, 0);
    const totalFlexMin = segmentedShifts.reduce((a, s) => a + s.flexMinutes, 0);
    const metrics = { 
      tasks: 0, 
      coverage_hours: coverageWindows.length,
      required_fulfilled: crewQuotas.length,
      total_product_hours: totalProductMin / 60,
      total_flex_hours: totalFlexMin / 60,
    };

    return { 
      run_id: run.id, 
      logbook_id: logbook.id, 
      violations: [], 
      metrics,
      // Include segmentation for debugging/validation until engine is integrated
      segmentedShifts,
    };
  });

  // Fetch logbook + tasks for a day/store
  app.get('/schedule/logbook', async (req, reply) => {
    const { date, store_id } = (req.query as any) ?? {};
    if (!date || !store_id) {
      return reply.code(400).send({ error: 'date & store_id required' });
    }

    const storeId = Number(store_id);
    if (!Number.isFinite(storeId)) {
      return reply.code(400).send({ error: 'store_id must be a number' });
    }

    const day = startOfDay(new Date(String(date)));

    const logbook = await prisma.logbook.findFirst({
      where: { date: day, storeId },
      include: {
        Assignment: {
          include: {
            Crew: { select: { id: true, name: true } },
            Role: { select: { id: true, code: true, displayName: true } },
          },
          orderBy: [{ startTime: 'asc' }],
        },
        LogPreferenceMetadata: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!logbook) {
      return reply.code(404).send({ error: 'No logbook for that day/store' });
    }

    const [shifts, rolesForStore] = await Promise.all([
      prisma.shift.findMany({
        where: { storeId, date: day },
        orderBy: [{ crewId: 'asc' }, { startMin: 'asc' }],
      }),
      prisma.role.findMany({
        where: { storeId },
        select: { id: true, code: true, displayName: true },
      }),
    ]);

    const crewMap = new Map<string, { id: string; name: string }>();
    const roleMap = new Map<number, { id: number; code: string; displayName: string }>();

    logbook.Assignment.forEach((assignment) => {
      if (assignment.Crew) {
        crewMap.set(assignment.Crew.id, {
          id: assignment.Crew.id,
          name: assignment.Crew.name,
        });
      } else {
        crewMap.set(assignment.crewId, {
          id: assignment.crewId,
          name: assignment.crewId,
        });
      }

      if (assignment.Role) {
        roleMap.set(assignment.Role.id, {
          id: assignment.Role.id,
          code: assignment.Role.code,
          displayName: assignment.Role.displayName,
        });
      }
    });

    const crew = Array.from(crewMap.values());
    const roles = roleMap.size
      ? Array.from(roleMap.values())
      : rolesForStore.map((role) => ({
          id: role.id,
          code: role.code,
          displayName: role.displayName,
        }));

    const normalizeShiftTime = (minutes: number) => {
      const shiftDate = new Date(day);
      shiftDate.setMinutes(minutes);
      return shiftDate.toISOString();
    };

    const normalizedShifts = shifts.map((shift) => ({
      id: shift.id,
      crewId: shift.crewId,
      startMinutes: shift.startMin,
      endMinutes: shift.endMin,
      startTime: normalizeShiftTime(shift.startMin),
      endTime: normalizeShiftTime(shift.endMin),
    }));

    const assignments = logbook.Assignment.map((assignment) => ({
      id: assignment.id,
      crewId: assignment.crewId,
      crewName: assignment.Crew?.name ?? assignment.crewId,
      roleId: assignment.roleId,
      roleCode: assignment.Role?.code ?? `ROLE_${assignment.roleId}`,
      roleName: assignment.Role?.displayName ?? assignment.Role?.code ?? `Role ${assignment.roleId}`,
      startTime: assignment.startTime.toISOString(),
      endTime: assignment.endTime.toISOString(),
    }));

    return {
      id: logbook.id,
      status: logbook.status,
      date: logbook.date.toISOString(),
      metadata: logbook.metadata,
      preferenceMetadata: logbook.LogPreferenceMetadata,
      assignments,
      crew,
      roles,
      shifts: normalizedShifts,
    };
  });

  // Fetch logbook by ID
  app.get('/schedule/logbook/:logbookId', async (req, reply) => {
    const { logbookId } = req.params as { logbookId: string };
    
    if (!logbookId) {
      return reply.code(400).send({ error: 'logbookId is required' });
    }

    const logbook = await prisma.logbook.findUnique({
      where: { id: logbookId },
      include: {
        Assignment: {
          include: {
            Crew: { select: { id: true, name: true } },
            Role: { select: { id: true, code: true, displayName: true } },
          },
          orderBy: [{ startTime: 'asc' }],
        },
        LogPreferenceMetadata: true,
      },
    });

    if (!logbook) {
      return reply.code(404).send({ error: 'Logbook not found' });
    }

    const [shifts, rolesForStore, crewWithRoles] = await Promise.all([
      prisma.shift.findMany({
        where: { storeId: logbook.storeId, date: logbook.date },
        orderBy: [{ crewId: 'asc' }, { startMin: 'asc' }],
      }),
      prisma.role.findMany({
        where: { storeId: logbook.storeId },
        select: { id: true, code: true, displayName: true, taskLength: true },
      }),
      prisma.crew.findMany({
        where: { storeId: logbook.storeId },
        select: {
          id: true,
          name: true,
          CrewRole: { select: { roleId: true } },
        },
      }),
    ]);

    // Build crew eligibility map
    const crewEligibility = new Map<string, number[]>();
    crewWithRoles.forEach((c) => {
      crewEligibility.set(c.id, c.CrewRole.map((cr) => cr.roleId));
    });

    const crewMap = new Map<string, { id: string; name: string; eligibleRoleIds: number[] }>();
    const roleMap = new Map<number, { id: number; code: string; displayName: string; taskLength: number }>();

    logbook.Assignment.forEach((assignment) => {
      const eligibleRoleIds = crewEligibility.get(assignment.crewId) ?? [];
      if (assignment.Crew) {
        crewMap.set(assignment.Crew.id, {
          id: assignment.Crew.id,
          name: assignment.Crew.name,
          eligibleRoleIds,
        });
      } else {
        crewMap.set(assignment.crewId, {
          id: assignment.crewId,
          name: assignment.crewId,
          eligibleRoleIds,
        });
      }

      if (assignment.Role) {
        const roleData = rolesForStore.find((r) => r.id === assignment.Role!.id);
        roleMap.set(assignment.Role.id, {
          id: assignment.Role.id,
          code: assignment.Role.code,
          displayName: assignment.Role.displayName,
          taskLength: roleData?.taskLength ?? 30,
        });
      }
    });

    const crew = Array.from(crewMap.values());
    const roles = roleMap.size
      ? Array.from(roleMap.values())
      : rolesForStore.map((role) => ({
          id: role.id,
          code: role.code,
          displayName: role.displayName,
          taskLength: role.taskLength,
        }));

    const normalizeShiftTime = (minutes: number) => {
      const shiftDate = new Date(logbook.date);
      shiftDate.setMinutes(minutes);
      return shiftDate.toISOString();
    };

    const normalizedShifts = shifts.map((shift) => ({
      id: shift.id,
      crewId: shift.crewId,
      startMinutes: shift.startMin,
      endMinutes: shift.endMin,
      startTime: normalizeShiftTime(shift.startMin),
      endTime: normalizeShiftTime(shift.endMin),
    }));

    const assignments = logbook.Assignment.map((assignment) => ({
      id: assignment.id,
      crewId: assignment.crewId,
      crewName: assignment.Crew?.name ?? assignment.crewId,
      roleId: assignment.roleId,
      roleCode: assignment.Role?.code ?? `ROLE_${assignment.roleId}`,
      roleName: assignment.Role?.displayName ?? assignment.Role?.code ?? `Role ${assignment.roleId}`,
      startTime: assignment.startTime.toISOString(),
      endTime: assignment.endTime.toISOString(),
    }));

    return {
      id: logbook.id,
      status: logbook.status,
      date: logbook.date.toISOString(),
      storedFilePath: logbook.storedFilePath,
      metadata: logbook.metadata,
      preferenceMetadata: logbook.LogPreferenceMetadata,
      assignments,
      crew,
      roles,
      shifts: normalizedShifts,
    };
  });

  // PATCH /schedule/logbook/:logbookId/assignments - Update assignments (for manual edits)
  // NOTE: Edits are stored visually on the frontend until publish.
  // This endpoint is kept for backward compatibility but the real work happens at publish time.
  // The frontend explodes 60-min assignments into 30-min slots for editing, 
  // and the publish endpoint handles splitting/creating the actual DB records.
  type AssignmentUpdate = {
    crewId: string;
    startMinutes: number;
    endMinutes: number;
    roleId: number;
  };
  
  type UpdateAssignmentsBody = {
    updates: AssignmentUpdate[];
  };

  app.patch<{ Params: { logbookId: string }; Body: UpdateAssignmentsBody }>(
    '/schedule/logbook/:logbookId/assignments',
    async (req, reply) => {
      const { logbookId } = req.params;
      const { updates } = req.body;

      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return reply.status(400).send({ error: 'No updates provided' });
      }

      // Verify logbook exists
      const logbook = await prisma.logbook.findUnique({
        where: { id: logbookId },
      });

      if (!logbook) {
        return reply.status(404).send({ error: 'Logbook not found' });
      }

      // Helper to convert minutes to Date
      const minutesToDate = (minutes: number): Date => {
        const d = new Date(logbook.date);
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCMinutes(minutes);
        return d;
      };

      // Helper to convert Date to minutes
      const dateToMinutes = (date: Date): number => {
        return date.getUTCHours() * 60 + date.getUTCMinutes();
      };

      // Process each update - this now handles splitting assignments
      const results: { updated: number; created: number; deleted: number; errors: string[] } = { 
        updated: 0, created: 0, deleted: 0, errors: [] 
      };

      for (const update of updates) {
        try {
          const editStart = update.startMinutes;
          const editEnd = update.endMinutes;

          // Find the assignment that CONTAINS this time slot
          const assignment = await prisma.assignment.findFirst({
            where: {
              logbookId,
              crewId: update.crewId,
              startTime: { lte: minutesToDate(editStart) },
              endTime: { gt: minutesToDate(editStart) },
            },
          });

          if (!assignment) {
            results.errors.push(`Assignment not found: crew ${update.crewId} at ${update.startMinutes}min`);
            continue;
          }

          const assignmentStart = dateToMinutes(assignment.startTime);
          const assignmentEnd = dateToMinutes(assignment.endTime);

          // Check if we need to split the assignment
          const needsSplitBefore = editStart > assignmentStart;
          const needsSplitAfter = editEnd < assignmentEnd;

          if (!needsSplitBefore && !needsSplitAfter) {
            // Simple case: edit covers the entire assignment, just update roleId
            await prisma.assignment.update({
              where: { id: assignment.id },
              data: {
                roleId: update.roleId,
                origin: 'MANUAL',
              },
            });
            results.updated++;
          } else {
            // Need to split: delete original and create new segments
            await prisma.$transaction(async (tx) => {
              // Delete the original assignment
              await tx.assignment.delete({ where: { id: assignment.id } });
              results.deleted++;

              // Create segment BEFORE the edit (if needed)
              if (needsSplitBefore) {
                await tx.assignment.create({
                  data: {
                    id: crypto.randomUUID(),
                    logbookId,
                    crewId: update.crewId,
                    roleId: assignment.roleId,
                    startTime: assignment.startTime,
                    endTime: minutesToDate(editStart),
                    origin: assignment.origin,
                  },
                });
                results.created++;
              }

              // Create the EDITED segment
              await tx.assignment.create({
                data: {
                  id: crypto.randomUUID(),
                  logbookId,
                  crewId: update.crewId,
                  roleId: update.roleId,
                  startTime: minutesToDate(editStart),
                  endTime: minutesToDate(editEnd),
                  origin: 'MANUAL',
                },
              });
              results.created++;

              // Create segment AFTER the edit (if needed)
              if (needsSplitAfter) {
                await tx.assignment.create({
                  data: {
                    id: crypto.randomUUID(),
                    logbookId,
                    crewId: update.crewId,
                    roleId: assignment.roleId,
                    startTime: minutesToDate(editEnd),
                    endTime: assignment.endTime,
                    origin: assignment.origin,
                  },
                });
                results.created++;
              }
            });
            results.updated++;
          }
        } catch (err) {
          results.errors.push(`Failed to update crew ${update.crewId} at ${update.startMinutes}min: ${err}`);
        }
      }

      // Recalculate satisfaction stats after assignment changes
      if (results.updated > 0 || results.created > 0) {
        try {
          await recalculateLogbookSatisfaction(logbookId);
        } catch (err) {
          console.error('[assignments] Failed to recalculate satisfaction:', err);
          // Don't fail the request, just log the error
        }
      }

      return {
        success: results.updated > 0 || results.created > 0,
        updated: results.updated,
        created: results.created,
        deleted: results.deleted,
        errors: results.errors,
      };
    }
  );

  // POST /schedule/logbook/:logbookId/publish - Publish a logbook (set status to PUBLISHED)
  // If another logbook is already published for the same date/store, delete it first
  // Also generates a PDF of the logbook and stores the file path
  // Body: { createdByName?: string, editCount?: number } - Optional name and edit count
  app.post<{ Params: { logbookId: string }; Body: { createdByName?: string; editCount?: number } }>(
    '/schedule/logbook/:logbookId/publish',
    {
      preHandler: rbacMiddleware({
        allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'],
        // Note: storeId comes from logbook lookup, not URL params, so we check manually below
      }),
    },
    async (req, reply) => {
      const { logbookId } = req.params;
      const { createdByName, editCount } = req.body || {};

      // Verify logbook exists
      const logbook = await prisma.logbook.findUnique({
        where: { id: logbookId },
      });

      if (!logbook) {
        return reply.status(404).send({ error: 'Logbook not found' });
      }

      // Manual store access check (since storeId comes from logbook, not URL params)
      const user = getUser(req);
      if (user && user.role !== 'ADMIN' && user.storeId !== logbook.storeId) {
        return reply.status(403).send({ error: 'Forbidden', message: 'You do not have access to this store' });
      }

      const wasAlreadyPublished = logbook.status === 'PUBLISHED' || logbook.status === LogbookStatus.PUBLISHED;

      // Check for any existing published logbook for the same date and store (different logbook)
      const existingPublished = await prisma.logbook.findFirst({
        where: {
          storeId: logbook.storeId,
          date: logbook.date,
          status: LogbookStatus.PUBLISHED,
          id: { not: logbookId }, // Exclude current logbook
        },
      });

      // Generate PDF (always regenerate, even if already published - assignments may have changed)
      // Recalculate satisfaction stats before publishing (ensures up-to-date metadata)
      try {
        await recalculateLogbookSatisfaction(logbookId);
        console.log(`[publish] Recalculated satisfaction for logbook ${logbookId}`);
      } catch (err) {
        console.error('[publish] Failed to recalculate satisfaction:', err);
        // Continue with publishing even if recalculation fails
      }

      let pdfPath: string | null = null;
      try {
        const pdfModule = await import('../services/pdf-generator') as any;
        // Handle ESM/CJS interop - exports may be nested under default
        const { generateLogbookPdf, deletePdf } = pdfModule.default ?? pdfModule;
        
        // Delete old PDF if replacing an existing published logbook
        if (existingPublished?.storedFilePath) {
          deletePdf(existingPublished.storedFilePath);
        }
        
        // Delete old PDF for this logbook if it exists (regenerating)
        if (logbook.storedFilePath) {
          deletePdf(logbook.storedFilePath);
        }
        
        pdfPath = await generateLogbookPdf(logbookId, logbook.storeId, logbook.date);
        console.log(`[publish] Generated PDF: ${pdfPath}`);
      } catch (err) {
        console.error('[publish] Failed to generate PDF:', err);
        // Continue with publishing even if PDF generation fails
      }

      // Use a transaction to delete old published logbook and publish the new one
      const updated = await prisma.$transaction(async (tx) => {
        // If there's an existing published logbook, delete it and all related records
        if (existingPublished) {
          await tx.assignment.deleteMany({ where: { logbookId: existingPublished.id } });
          await tx.logPreferenceMetadata.deleteMany({ where: { logbookId: existingPublished.id } });
          await tx.run.deleteMany({ where: { logbookId: existingPublished.id } });
          await tx.logbook.delete({ where: { id: existingPublished.id } });
        }

        // Update status to PUBLISHED and store PDF path
        return tx.logbook.update({
          where: { id: logbookId },
          data: {
            status: LogbookStatus.PUBLISHED,
            storedFilePath: pdfPath,
            createdByName: createdByName || null,
            publishedAt: new Date(),
          },
        });
      });

      // Log activity for publish (user already retrieved above for store access check)
      if (user) {
        if (editCount && editCount > 0) {
          await logLogbookPublishWithEdits(user.id, logbookId, logbook.storeId, logbook.date, editCount);
        } else {
          await logLogbookPublish(user.id, Number(logbookId), logbook.storeId, logbook.date, {
            previousStatus: wasAlreadyPublished ? 'PUBLISHED' : 'DRAFT',
          });
        }
      }

      return {
        success: true,
        logbookId: updated.id,
        status: updated.status,
        pdfPath: updated.storedFilePath,
        replacedLogbookId: existingPublished?.id ?? null,
        wasRepublish: wasAlreadyPublished,
      };
    }
  );

  // DELETE /schedule/logbook/:logbookId - Delete a logbook and all related records
  app.delete<{ Params: { logbookId: string } }>(
    '/schedule/logbook/:logbookId',
    async (req, reply) => {
      const { logbookId } = req.params;

      // Verify logbook exists
      const logbook = await prisma.logbook.findUnique({
        where: { id: logbookId },
      });

      if (!logbook) {
        return reply.status(404).send({ error: 'Logbook not found' });
      }

      // Delete all related records in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.assignment.deleteMany({ where: { logbookId } });
        await tx.logPreferenceMetadata.deleteMany({ where: { logbookId } });
        await tx.run.deleteMany({ where: { logbookId } });
        // Clear supersede references from logbooks that point to this one
        await tx.logbook.updateMany({
          where: { supersededById: logbookId },
          data: { supersededById: null },
        });
        await tx.logbook.delete({ where: { id: logbookId } });
      });

      // Delete PDF file if it exists
      if (logbook.storedFilePath) {
        const pdfModule = await import('../services/pdf-generator') as any;
        const { deletePdf } = pdfModule.default ?? pdfModule;
        deletePdf(logbook.storedFilePath);
      }

      return {
        success: true,
        logbookId,
        message: 'Logbook deleted successfully',
      };
    }
  );

  // GET /schedule/logbook/:logbookId/pdf - View or download the PDF for a logbook
  // Query params: download=true to force download, otherwise displays inline
  app.get<{ Params: { logbookId: string }; Querystring: { download?: string } }>(
    '/schedule/logbook/:logbookId/pdf',
    async (req, reply) => {
      const { logbookId } = req.params;
      const { download } = req.query;

      const logbook = await prisma.logbook.findUnique({
        where: { id: logbookId },
      });

      if (!logbook) {
        return reply.status(404).send({ error: 'Logbook not found' });
      }

      if (!logbook.storedFilePath) {
        return reply.status(404).send({ error: 'No PDF available for this logbook' });
      }

      const fs = await import('fs');
      const path = await import('path');

      if (!fs.existsSync(logbook.storedFilePath)) {
        return reply.status(404).send({ error: 'PDF file not found on disk' });
      }

      const filename = path.basename(logbook.storedFilePath);
      const stream = fs.createReadStream(logbook.storedFilePath);

      // Use 'inline' for viewing in browser, 'attachment' for download
      const disposition = download === 'true' ? 'attachment' : 'inline';

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `${disposition}; filename="${filename}"`)
        .send(stream);
    }
  );

  // GET /schedule/logbook/:logbookId/pdf/preview - Generate and preview PDF without saving (for development)
  app.get<{ Params: { logbookId: string } }>(
    '/schedule/logbook/:logbookId/pdf/preview',
    async (req, reply) => {
      const { logbookId } = req.params;

      const logbook = await prisma.logbook.findUnique({
        where: { id: logbookId },
      });

      if (!logbook) {
        return reply.status(404).send({ error: 'Logbook not found' });
      }

      try {
        const pdfModule = await import('../services/pdf-generator') as any;
        const { generateLogbookPdf } = pdfModule.default ?? pdfModule;
        
        // Generate fresh PDF
        const pdfPath = await generateLogbookPdf(logbookId, logbook.storeId, logbook.date);
        
        const fs = await import('fs');
        const path = await import('path');
        
        const filename = path.basename(pdfPath);
        const stream = fs.createReadStream(pdfPath);

        // Clean up after sending (don't store for preview)
        stream.on('end', () => {
          fs.unlink(pdfPath, () => {}); // Silent cleanup
        });

        return reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `inline; filename="${filename}"`) // inline for browser preview
          .header('Cache-Control', 'no-cache, no-store, must-revalidate')
          .send(stream);
      } catch (err: any) {
        console.error('[pdf/preview] Failed to generate PDF:', err);
        return reply.status(500).send({ error: 'Failed to generate PDF', details: err.message });
      }
    }
  );

  // GET /schedule/logbook/check-changes - Check if shifts/constraints have changed since last logbook generation
  // Returns whether regeneration is needed and existing logbook ID if available
  app.get<{ Querystring: { store_id: string; date: string } }>(
    '/schedule/logbook/check-changes',
    async (req, reply) => {
      const { store_id, date } = req.query;

      if (!store_id || !date) {
        return reply.status(400).send({ error: 'store_id and date query params are required' });
      }

      const storeId = Number(store_id);
      if (!Number.isFinite(storeId)) {
        return reply.status(400).send({ error: 'store_id must be a number' });
      }

      // Pass string directly to startOfDay to use UTC parsing
      const day = startOfDay(date);
      console.log('[check-changes] Parsed date:', date, '-> day:', day.toISOString());

      // Get existing logbook for this store/date
      const existingLogbook = await prisma.logbook.findFirst({
        where: { storeId, date: day },
        orderBy: { createdAt: 'desc' },
      });
      console.log('[check-changes] Found logbook:', existingLogbook ? existingLogbook.id : 'NONE');

      if (!existingLogbook) {
        // Debug: check what logbooks exist for this store
        const allLogbooks = await prisma.logbook.findMany({
          where: { storeId },
          select: { id: true, date: true, status: true },
          orderBy: { date: 'desc' },
          take: 5,
        });
        console.log('[check-changes] Recent logbooks for store:', allLogbooks.map(l => ({ id: l.id, date: l.date.toISOString(), status: l.status })));
        
        return {
          needsRegeneration: true,
          reason: 'no_logbook',
          existingLogbookId: null,
        };
      }

      // Compute current input hash from shifts + constraints
      const [shifts, coverageWindows, crewQuotas] = await Promise.all([
        prisma.shift.findMany({
          where: { storeId, date: day },
          select: { crewId: true, startMin: true, endMin: true },
          orderBy: [{ crewId: 'asc' }, { startMin: 'asc' }],
        }),
        prisma.roleCoverageWindow.findMany({
          where: { storeId, date: day },
          select: { roleId: true, startMin: true, endMin: true, crewPerMinute: true, constraintRule: true },
          orderBy: [{ roleId: 'asc' }, { startMin: 'asc' }],
        }),
        prisma.crewRoleQuota.findMany({
          where: { storeId, date: day },
          select: { roleId: true, crewId: true, startMin: true, endMin: true, requiredMin: true },
          orderBy: [{ roleId: 'asc' }, { crewId: 'asc' }],
        }),
      ]);

      // Create a deterministic hash of the input data
      const inputData = JSON.stringify({ shifts, coverageWindows, crewQuotas });
      const currentHash = require('crypto').createHash('sha256').update(inputData).digest('hex').substring(0, 16);

      // Get stored hash from logbook metadata
      const metadata = existingLogbook.metadata as { inputHash?: string } | null;
      const storedHash = metadata?.inputHash;

      if (!storedHash) {
        // No hash stored - logbook was generated before this feature, regenerate
        return {
          needsRegeneration: true,
          reason: 'no_hash_stored',
          existingLogbookId: existingLogbook.id,
          existingStatus: existingLogbook.status,
        };
      }

      if (storedHash !== currentHash) {
        return {
          needsRegeneration: true,
          reason: 'inputs_changed',
          existingLogbookId: existingLogbook.id,
          existingStatus: existingLogbook.status,
        };
      }

      // Hashes match - no regeneration needed
      return {
        needsRegeneration: false,
        reason: 'no_changes',
        existingLogbookId: existingLogbook.id,
        existingStatus: existingLogbook.status,
      };
    }
  );

  // GET /schedule/stats/baselines - Get historical baselines for stats badges
  app.get<{ Querystring: { storeId: string; days?: string } }>(
    '/schedule/stats/baselines',
    async (req, reply) => {
      const { storeId, days } = req.query;
      
      if (!storeId) {
        return reply.status(400).send({ error: 'storeId is required' });
      }

      const storeIdNum = Number(storeId);
      if (!Number.isFinite(storeIdNum)) {
        return reply.status(400).send({ error: 'storeId must be a number' });
      }

      const lookbackDays = Number(days) || 14; // Default to 2 weeks
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

      // Fetch historical preference metadata from the last N days
      const historicalData = await prisma.logPreferenceMetadata.findMany({
        where: {
          Logbook: {
            storeId: storeIdNum,
            date: { gte: cutoffDate },
            status: 'PUBLISHED', // Only use published logbooks for baselines
          },
        },
        select: {
          eligiblePreferences: true,
          preferencesMet: true,
          avgSatisfaction: true,
          fairnessIndex: true,
        },
      });

      if (historicalData.length === 0) {
        // No historical data - return null to signal using defaults
        return {
          hasHistoricalData: false,
          sampleSize: 0,
          baselines: null,
        };
      }

      // Calculate averages from historical data
      const totalRecords = historicalData.length;
      
      // Overall preferences met percentage
      const totalPrefsSum = historicalData.reduce((sum, d) => sum + d.eligiblePreferences, 0);
      const metPrefsSum = historicalData.reduce((sum, d) => sum + d.preferencesMet, 0);
      const overallPrefsMetPct = totalPrefsSum > 0 ? (metPrefsSum / totalPrefsSum) * 100 : 50;

      // Average satisfaction (per-crew avg) - now stored as 0-100
      const avgSatisfactionSum = historicalData.reduce((sum, d) => sum + (d.avgSatisfaction ?? 0), 0);
      const avgSatisfactionPct = avgSatisfactionSum / totalRecords;

      // Fairness - already stored as 0-100
      const fairnessSum = historicalData.reduce((sum, d) => sum + (d.fairnessIndex ?? 0), 0);
      const avgFairness = fairnessSum / totalRecords;

      // Calculate standard deviation for tolerance (use half of std dev as tolerance)
      const overallPctValues = historicalData.map(d => 
        d.eligiblePreferences > 0 ? (d.preferencesMet / d.eligiblePreferences) * 100 : 0
      );
      const overallStdDev = calculateStdDev(overallPctValues, overallPrefsMetPct);
      
      const satisfactionValues = historicalData.map(d => d.avgSatisfaction ?? 0);
      const satisfactionStdDev = calculateStdDev(satisfactionValues, avgSatisfactionPct);

      const fairnessValues = historicalData.map(d => d.fairnessIndex ?? 0);
      const fairnessStdDev = calculateStdDev(fairnessValues, avgFairness);

      return {
        hasHistoricalData: true,
        sampleSize: totalRecords,
        lookbackDays,
        baselines: {
          preferencesOverallPct: Math.round(overallPrefsMetPct * 10) / 10,
          preferencesOverallTolerance: Math.max(3, Math.round(overallStdDev / 2)),
          perCrewAvgPct: Math.round(avgSatisfactionPct * 10) / 10,
          perCrewAvgTolerance: Math.max(3, Math.round(satisfactionStdDev / 2)),
          fairnessPct: Math.round(avgFairness * 10) / 10,
          fairnessTolerance: Math.max(3, Math.round(fairnessStdDev / 2)),
        },
      };
    }
  );
}

// Helper function to calculate standard deviation
function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 5; // Default tolerance if not enough data
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Register logbook list and history endpoints
 */
export function registerLogbookRoutes(app: FastifyInstance) {
  // GET /logbooks - List logbooks for a store with optional filters
  // Query params: storeId (required), status (optional), limit (optional), offset (optional)
  app.get<{ Querystring: { storeId: string; status?: string; limit?: string; offset?: string } }>(
    '/logbooks',
    async (req, reply) => {
      const { storeId, status, limit, offset } = req.query;

      if (!storeId) {
        return reply.status(400).send({ error: 'storeId is required' });
      }

      const storeIdNum = Number(storeId);
      if (!Number.isFinite(storeIdNum)) {
        return reply.status(400).send({ error: 'storeId must be a number' });
      }

      const limitNum = Number(limit) || 50;
      const offsetNum = Number(offset) || 0;

      // Build where clause
      const where: any = { storeId: storeIdNum };
      if (status) {
        // Validate status enum
        const validStatuses = ['DRAFT', 'PUBLISHED', 'SUPERSEDED'];
        if (!validStatuses.includes(status.toUpperCase())) {
          return reply.status(400).send({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
        }
        where.status = status.toUpperCase();
      }

      const [logbooks, total] = await Promise.all([
        prisma.logbook.findMany({
          where,
          include: {
            LogPreferenceMetadata: {
              select: {
                avgSatisfaction: true,
                fairnessGrade: true,
                percentMet: true,
              },
            },
            supersedes: {
              select: { id: true },
            },
          },
          orderBy: { date: 'desc' },
          take: limitNum,
          skip: offsetNum,
        }),
        prisma.logbook.count({ where }),
      ]);

      return {
        logbooks: logbooks.map(lb => ({
          id: lb.id,
          date: lb.date.toISOString(),
          status: lb.status,
          storedFilePath: lb.storedFilePath,
          createdByName: lb.createdByName,
          publishedAt: lb.publishedAt?.toISOString() ?? null,
          createdAt: lb.createdAt.toISOString(),
          hasSupersededVersions: lb.supersedes.length > 0,
          metadata: lb.LogPreferenceMetadata ? {
            avgSatisfaction: lb.LogPreferenceMetadata.avgSatisfaction,
            fairnessGrade: lb.LogPreferenceMetadata.fairnessGrade,
            percentMet: lb.LogPreferenceMetadata.percentMet,
          } : null,
        })),
        total,
        limit: limitNum,
        offset: offsetNum,
      };
    }
  );

  // GET /logbooks/:id/history - Get all logbook versions for the same date
  // Returns all logbooks for the same date and store, sorted by status priority and createdAt
  app.get<{ Params: { id: string } }>(
    '/logbooks/:id/history',
    async (req, reply) => {
      const { id } = req.params;

      // First get the logbook to find its date and storeId
      const logbook = await prisma.logbook.findUnique({
        where: { id },
        select: { date: true, storeId: true },
      });

      if (!logbook) {
        return reply.status(404).send({ error: 'Logbook not found' });
      }

      // Find all logbooks for the same date and store
      const allVersions = await prisma.logbook.findMany({
        where: {
          date: logbook.date,
          storeId: logbook.storeId,
        },
        orderBy: [
          { createdAt: 'desc' },
        ],
        select: {
          id: true,
          date: true,
          status: true,
          storedFilePath: true,
          createdByName: true,
          publishedAt: true,
          createdAt: true,
          Run: {
            select: {
              id: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      });

      // Sort by status priority (PUBLISHED > DRAFT > SUPERSEDED) then by createdAt desc
      const statusPriority: Record<string, number> = { PUBLISHED: 3, DRAFT: 2, SUPERSEDED: 1 };
      allVersions.sort((a, b) => {
        const priorityDiff = (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      // The "current" is the one with highest priority (first in sorted list)
      const current = allVersions[0];
      const supersededVersions = allVersions.slice(1);

      return {
        current: current ? {
          id: current.id,
          date: current.date.toISOString(),
          status: current.status,
          storedFilePath: current.storedFilePath,
          createdByName: current.createdByName,
          publishedAt: current.publishedAt?.toISOString() ?? null,
          createdAt: current.createdAt.toISOString(),
          runId: current.Run[0]?.id ?? null,
        } : null,
        supersededVersions: supersededVersions.map(v => ({
          id: v.id,
          date: v.date.toISOString(),
          status: v.status,
          storedFilePath: v.storedFilePath,
          createdByName: v.createdByName,
          publishedAt: v.publishedAt?.toISOString() ?? null,
          createdAt: v.createdAt.toISOString(),
          runId: v.Run[0]?.id ?? null,
        })),
      };
    }
  );

  // POST /logbooks/:id/supersede - Mark current as superseded and create new version
  // Body: { createdByName: string }
  // This creates a new DRAFT logbook and marks the current one as SUPERSEDED
  app.post<{ Params: { id: string }; Body: { createdByName?: string } }>(
    '/logbooks/:id/supersede',
    async (req, reply) => {
      const { id } = req.params;
      const { createdByName } = req.body || {};

      const currentLogbook = await prisma.logbook.findUnique({
        where: { id },
        include: {
          Assignment: true,
        },
      });

      if (!currentLogbook) {
        return reply.status(404).send({ error: 'Logbook not found' });
      }

      if (currentLogbook.status !== 'PUBLISHED' && currentLogbook.status !== LogbookStatus.PUBLISHED) {
        return reply.status(400).send({
          error: 'Only published logbooks can be superseded',
          currentStatus: currentLogbook.status,
        });
      }

      // Create new draft logbook and mark current as superseded
      const result = await prisma.$transaction(async (tx) => {
        // Create new DRAFT logbook
        const newLogbook = await tx.logbook.create({
          data: {
            id: crypto.randomUUID(),
            date: currentLogbook.date,
            storeId: currentLogbook.storeId,
            status: LogbookStatus.DRAFT,
            generatedAt: new Date(),
            createdByName: createdByName || null,
            metadata: currentLogbook.metadata,
          },
        });

        // Copy assignments from current to new logbook
        if (currentLogbook.Assignment.length > 0) {
          await tx.assignment.createMany({
            data: currentLogbook.Assignment.map(a => ({
              id: crypto.randomUUID(),
              logbookId: newLogbook.id,
              crewId: a.crewId,
              roleId: a.roleId,
              startTime: a.startTime,
              endTime: a.endTime,
              origin: a.origin,
              locked: a.locked,
            })),
          });
        }

        // Mark current logbook as superseded
        await tx.logbook.update({
          where: { id: currentLogbook.id },
          data: {
            status: LogbookStatus.SUPERSEDED,
            supersededById: newLogbook.id,
          },
        });

        return newLogbook;
      });

      return {
        success: true,
        newLogbookId: result.id,
        supersededLogbookId: currentLogbook.id,
        message: 'Logbook superseded successfully. New draft created.',
      };
    }
  );
}
