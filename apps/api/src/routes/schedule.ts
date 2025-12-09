import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startOfDay, hourOf, clamp } from '../utils';
import { type Shift } from '../services/demo-window';
import { segmentShiftByRegisterWindow, hhmmToMin, minToHHMM } from '../services/segmentation';

// Import enums using require for runtime access
const { LogbookStatus } = require('@prisma/client');

const prisma = new PrismaClient();

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

      // Process each update - find assignment by crewId + startTime, update roleId
      const results: { updated: number; errors: string[] } = { updated: 0, errors: [] };

      for (const update of updates) {
        try {
          // Convert startMinutes to a DateTime for that logbook's date
          const startTime = new Date(logbook.date);
          startTime.setUTCHours(0, 0, 0, 0);
          startTime.setUTCMinutes(update.startMinutes);

          // Find the assignment by logbookId + crewId + startTime
          const assignment = await prisma.assignment.findFirst({
            where: {
              logbookId,
              crewId: update.crewId,
              startTime,
            },
          });

          if (assignment) {
            await prisma.assignment.update({
              where: { id: assignment.id },
              data: {
                roleId: update.roleId,
                origin: 'MANUAL', // Mark as manually edited
              },
            });
            results.updated++;
          } else {
            results.errors.push(`Assignment not found: crew ${update.crewId} at ${update.startMinutes}min`);
          }
        } catch (err) {
          results.errors.push(`Failed to update crew ${update.crewId} at ${update.startMinutes}min: ${err}`);
        }
      }

      return {
        success: results.updated > 0,
        updated: results.updated,
        errors: results.errors,
      };
    }
  );

  // POST /schedule/logbook/:logbookId/publish - Publish a logbook (set status to PUBLISHED)
  // If another logbook is already published for the same date/store, delete it first
  // Also generates a PDF of the logbook and stores the file path
  app.post<{ Params: { logbookId: string } }>(
    '/schedule/logbook/:logbookId/publish',
    async (req, reply) => {
      const { logbookId } = req.params;

      // Verify logbook exists
      const logbook = await prisma.logbook.findUnique({
        where: { id: logbookId },
      });

      if (!logbook) {
        return reply.status(404).send({ error: 'Logbook not found' });
      }

      // If already published, just return success (no update needed)
      // Compare as string to handle both enum and string values
      if (logbook.status === 'PUBLISHED' || logbook.status === LogbookStatus.PUBLISHED) {
        return {
          success: true,
          logbookId: logbook.id,
          status: logbook.status,
          pdfPath: logbook.storedFilePath,
          message: 'Logbook is already published',
        };
      }

      // Check for any existing published logbook for the same date and store
      const existingPublished = await prisma.logbook.findFirst({
        where: {
          storeId: logbook.storeId,
          date: logbook.date,
          status: LogbookStatus.PUBLISHED,
          id: { not: logbookId }, // Exclude current logbook
        },
      });

      // Generate PDF before publishing
      let pdfPath: string | null = null;
      try {
        const pdfModule = await import('../services/pdf-generator') as any;
        // Handle ESM/CJS interop - exports may be nested under default
        const { generateLogbookPdf, deletePdf } = pdfModule.default ?? pdfModule;
        
        // Delete old PDF if replacing an existing published logbook
        if (existingPublished?.storedFilePath) {
          deletePdf(existingPublished.storedFilePath);
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
          await tx.preferenceSatisfaction.deleteMany({ where: { logbookId: existingPublished.id } });
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
          },
        });
      });

      return {
        success: true,
        logbookId: updated.id,
        status: updated.status,
        pdfPath: updated.storedFilePath,
        replacedLogbookId: existingPublished?.id ?? null,
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
        await tx.preferenceSatisfaction.deleteMany({ where: { logbookId } });
        await tx.logPreferenceMetadata.deleteMany({ where: { logbookId } });
        await tx.run.deleteMany({ where: { logbookId } });
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

  // GET /schedule/logbook/:logbookId/pdf - Download the PDF for a logbook
  app.get<{ Params: { logbookId: string } }>(
    '/schedule/logbook/:logbookId/pdf',
    async (req, reply) => {
      const { logbookId } = req.params;

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

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
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
          select: { roleId: true, startMin: true, endMin: true, crewPerTaskLength: true },
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
}
