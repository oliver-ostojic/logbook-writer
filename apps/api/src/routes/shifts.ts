import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startOfDay } from '../utils';
import { minToHHMM, hhmmToMin } from '../services/segmentation';
import { rbacMiddleware, getUser } from '../middleware/rbac';
import { logShiftsAdd, logShiftsEdit } from '../services/activity-logger';

const prisma = new PrismaClient();

export function registerShiftRoutes(app: FastifyInstance) {
  // List shifts for a store on a given date
  app.get('/stores/:storeId/shifts', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const { date } = (req.query as any) ?? {};
    if (!storeId || !date) {
      return reply.code(400).send({ error: 'storeId path param and date query (YYYY-MM-DD) are required' });
    }
    const day = startOfDay(String(date));
    const sid = Number(storeId);
    if (!Number.isFinite(sid)) {
      return reply.code(400).send({ error: 'storeId must be a number' });
    }

    const shifts = await prisma.shift.findMany({
      where: { storeId: sid, date: day },
      orderBy: [{ crewId: 'asc' }]
    });

    // Present times as HH:MM for UI
    const result = shifts.map(s => ({
      crewId: s.crewId,
      storeId: s.storeId,
      date: s.date.toISOString().slice(0, 10),
      start: minToHHMM(s.startMin),
      end: minToHHMM(s.endMin),
    }));
    return result;
  });

  // Upsert shifts for a store on a given date (idempotent per crewId)
  app.post('/stores/:storeId/shifts', {
    preHandler: rbacMiddleware({
      allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'],
      requireStoreAccess: true,
    }),
  }, async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const { date, shifts } = (req.body as any) ?? {};
    if (!storeId || !date || !Array.isArray(shifts)) {
      return reply.code(400).send({ error: 'storeId path, and body { date, shifts[] } are required' });
    }
    const sid = Number(storeId);
    if (!Number.isFinite(sid)) return reply.code(400).send({ error: 'storeId must be a number' });
    const day = startOfDay(String(date));

    // Check if shifts already exist for this date (to determine add vs edit)
    const existingShifts = await prisma.shift.findMany({
      where: { storeId: sid, date: day },
      select: { crewId: true },
    });
    const hadExistingShifts = existingShifts.length > 0;

    // Validate payload minimally
    const normalized = shifts
      .filter((s: any) => s && typeof s.crewId === 'string' && typeof s.start === 'string' && typeof s.end === 'string')
      .map((s: any) => ({
        crewId: s.crewId,
        startMin: hhmmToMin(s.start),
        endMin: hhmmToMin(s.end),
      }));

    await prisma.$transaction(async (tx) => {
      const keepIds = new Set(normalized.map(s => s.crewId));

      // Delete any shifts for this day/store not present in the payload
      if (keepIds.size === 0) {
        await tx.shift.deleteMany({ where: { storeId: sid, date: day } });
      } else {
        await tx.shift.deleteMany({
          where: {
            storeId: sid,
            date: day,
            crewId: { notIn: Array.from(keepIds) }
          }
        });
      }

      for (const s of normalized) {
        const updated = await tx.shift.updateMany({
          where: { storeId: sid, date: day, crewId: s.crewId },
          data: { startMin: s.startMin, endMin: s.endMin },
        });
        if (updated.count === 0) {
          await tx.shift.create({
            data: {
              storeId: sid,
              date: day,
              crewId: s.crewId,
              startMin: s.startMin,
              endMin: s.endMin,
            }
          });
        }
      }
    });

    // Log activity after successful save
    const user = getUser(req);
    if (user) {
      const metadata = {
        shiftCount: normalized.length,
        crewIds: normalized.map(s => s.crewId),
      };
      if (hadExistingShifts) {
        await logShiftsEdit(user.id, sid, day, metadata);
      } else {
        await logShiftsAdd(user.id, sid, day, metadata);
      }
    }

    return { ok: true, count: normalized.length };
  });

  // Get crew with shifts grouped by role for a specific date
  // Used by constraints page to show dynamic coverage windows
  app.get('/stores/:storeId/crew-with-shifts', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const { date } = (req.query as any) ?? {};
    
    if (!storeId || !date) {
      return reply.code(400).send({ error: 'storeId path param and date query (YYYY-MM-DD) are required' });
    }
    
    const sid = Number(storeId);
    if (!Number.isFinite(sid)) {
      return reply.code(400).send({ error: 'storeId must be a number' });
    }
    
    const day = startOfDay(String(date));

    // Find all crew who have shifts on this date
    const shiftsOnDate = await prisma.shift.findMany({
      where: { storeId: sid, date: day },
      select: { crewId: true },
      distinct: ['crewId'],
    });

    const crewIds = shiftsOnDate.map(s => s.crewId);
    
    if (crewIds.length === 0) {
      return [];
    }

    // Get all roles assigned to these crew members that support COVERAGE_WINDOW
    const crewRoles = await prisma.crewRole.findMany({
      where: { crewId: { in: crewIds } },
      include: {
        Role: {
          select: {
            id: true,
            code: true,
            displayName: true,
            assignmentModel: true,
          }
        }
      }
    });

    // Group by role and count unique crew
    // Step 1 shows roles with WINDOW or HOURLY_OR_WINDOW assignmentModel
    const roleMap = new Map<number, { roleId: number; roleCode: string; roleName: string; assignmentModel: string; crewIds: Set<string> }>();
    
    for (const cr of crewRoles) {
      // Only include roles that have WINDOW or HOURLY_OR_WINDOW assignmentModel
      const model = cr.Role.assignmentModel;
      if (model !== 'WINDOW' && model !== 'HOURLY_OR_WINDOW') {
        continue;
      }
      
      const roleId = cr.roleId;
      if (!roleMap.has(roleId)) {
        roleMap.set(roleId, {
          roleId,
          roleCode: cr.Role.code,
          roleName: cr.Role.displayName,
          assignmentModel: model,
          crewIds: new Set(),
        });
      }
      roleMap.get(roleId)!.crewIds.add(cr.crewId);
    }

    // Convert to array with crew count
    const result = Array.from(roleMap.values()).map(r => ({
      roleId: r.roleId,
      roleCode: r.roleCode,
      roleName: r.roleName,
      crewCount: r.crewIds.size,
      assignmentModel: r.assignmentModel,
    }));

    return result;
  });

  // Get roles with DAILY assignment model for daily requirements
  app.get('/stores/:storeId/daily-roles', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const { date } = (req.query as any) ?? {};
    
    if (!storeId || !date) {
      return reply.code(400).send({ error: 'storeId path param and date query (YYYY-MM-DD) are required' });
    }
    
    const sid = Number(storeId);
    if (!Number.isFinite(sid)) {
      return reply.code(400).send({ error: 'storeId must be a number' });
    }
    
    const day = startOfDay(String(date));

    // Find all crew who have shifts on this date
    const shiftsOnDate = await prisma.shift.findMany({
      where: { storeId: sid, date: day },
      select: { crewId: true },
      distinct: ['crewId'],
    });

    const crewIds = shiftsOnDate.map(s => s.crewId);
    
    if (crewIds.length === 0) {
      return [];
    }

    // Get all roles assigned to these crew members that support DAILY
    const crewRoles = await prisma.crewRole.findMany({
      where: { crewId: { in: crewIds } },
      include: {
        Role: {
          select: {
            id: true,
            code: true,
            displayName: true,
            assignmentModel: true,
          }
        },
        Crew: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    // Group by role and collect crew info, filtering for DAILY assignment type
  const roleMap = new Map<number, { roleId: number; roleCode: string; roleName: string; crew: Array<{ crewId: string; crewName: string; specialization?: string | null }> }>();
    
    for (const cr of crewRoles) {
      // Only include roles that have DAILY assignmentModel
      if (cr.Role.assignmentModel !== 'DAILY') {
        continue;
      }
      
      const roleId = cr.roleId;
      if (!roleMap.has(roleId)) {
        roleMap.set(roleId, {
          roleId,
          roleCode: cr.Role.code,
          roleName: cr.Role.displayName,
          crew: [],
        });
      }
      roleMap.get(roleId)!.crew.push({
        crewId: cr.crewId,
        crewName: cr.Crew.name,
        specialization: cr.specialization ?? null,
      });
    }

    // Convert to array with crew list
    const result = Array.from(roleMap.values()).map(r => ({
      roleId: r.roleId,
      roleCode: r.roleCode,
      roleName: r.roleName,
      crew: r.crew,
    }));

    return result;
  });

  // Get crew availability per hour for a specific date
  app.get('/stores/:storeId/crew-per-hour', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const { date } = (req.query as any) ?? {};
    
    if (!storeId || !date) {
      return reply.code(400).send({ error: 'storeId path param and date query (YYYY-MM-DD) are required' });
    }
    
    const sid = Number(storeId);
    if (!Number.isFinite(sid)) {
      return reply.code(400).send({ error: 'storeId must be a number' });
    }
    
    const day = startOfDay(String(date));

    // Get all shifts for this date
    const shifts = await prisma.shift.findMany({
      where: { storeId: sid, date: day },
      select: { startMin: true, endMin: true },
    });

    if (shifts.length === 0) {
      return [];
    }

    // Calculate crew per hour (0-23)
    const crewPerHour: Record<number, number> = {};
    
    for (let hour = 0; hour < 24; hour++) {
      const hourStartMin = hour * 60;
      const hourEndMin = (hour + 1) * 60;
      
      let count = 0;
      for (const shift of shifts) {
        // Check if shift overlaps with this hour
        // A shift overlaps if: shift.start < hourEnd AND shift.end > hourStart
        if (shift.startMin < hourEndMin && shift.endMin > hourStartMin) {
          count++;
        }
      }
      
      crewPerHour[hour] = count;
    }

    // Convert to array format with hour labels
    const result = [];
    for (let hour = 0; hour < 24; hour++) {
      const count = crewPerHour[hour] || 0;
      const isPM = hour >= 12;
      const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const period = isPM ? 'PM' : 'AM';
      
      result.push({
        hour,
        label: `${displayHour} ${period}`,
        crewAvailable: count,
        inStock: count > 0,
      });
    }

    return result;
  });

  // List HOURLY assignment roles (Register, Product, Parking Helms, etc.) for configuring hourly staffing
  // Step 3 shows roles with HOURLY, HOURLY_OR_WINDOW, or HOURLY_AND_SOLVER assignmentModel
  app.get('/stores/:storeId/hourly-roles', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };

    if (!storeId) {
      return reply.code(400).send({ error: 'storeId path param is required' });
    }

    const sid = Number(storeId);
    if (!Number.isFinite(sid)) {
      return reply.code(400).send({ error: 'storeId must be a number' });
    }

    const roles = await prisma.role.findMany({
      where: {
        storeId: sid,
        assignmentModel: {
          in: ['HOURLY', 'HOURLY_OR_WINDOW', 'HOURLY_AND_SOLVER'],
        },
      },
      select: {
        id: true,
        code: true,
        displayName: true,
        allowOutsideStoreHours: true,
        assignmentModel: true,
      },
      orderBy: [{ displayName: 'asc' }],
    });

    return roles.map((role) => ({
      roleId: role.id,
      roleCode: role.code,
      roleName: role.displayName,
      assignmentModel: role.assignmentModel,
      allowOutsideStoreHours: role.allowOutsideStoreHours,
      crewCount: 0,
    }));
  });

  // Store hours metadata so the UI can limit hourly staffing selections
  app.get('/stores/:storeId/hours', async (req, reply) => {
    const { storeId } = req.params as { storeId: string };

    if (!storeId) {
      return reply.code(400).send({ error: 'storeId path param is required' });
    }

    const sid = Number(storeId);
    if (!Number.isFinite(sid)) {
      return reply.code(400).send({ error: 'storeId must be a number' });
    }

    const store = await prisma.store.findUnique({
      where: { id: sid },
      select: {
        id: true,
        name: true,
        timezone: true,
        openMinutesFromMidnight: true,
        closeMinutesFromMidnight: true,
      },
    });

    if (!store) {
      return reply.code(404).send({ error: 'Store not found' });
    }

    // baseSlotMinutes is now fixed at 30 (roles have their own taskLength)
    return { ...store, baseSlotMinutes: 30 };
  });
}

