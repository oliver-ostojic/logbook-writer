import { FastifyInstance } from 'fastify';
import { Prisma, PrismaClient, PrefenceTask } from '@prisma/client';
import { PREFERENCE_CONFIG } from '../config/preferences';

const prisma = new PrismaClient();

type CreateCrewBody = {
  id: string; // explicit 7-char crew id required
  name: string;
  storeId?: number;
  // All below optional for simplified creation
  shiftStartMin?: number;
  shiftEndMin?: number;
  roleIds?: Array<number | string>;
  prefFirstHour?: string;
  prefFirstHourWeight?: number;
  prefTask?: string;
  prefTaskWeight?: number;
  consecutiveProdWeight?: number;
  consecutiveRegWeight?: number;
  prefBreakTiming?: number;
  prefBreakTimingWeight?: number;
};

type UpdateCrewBody = {
  name?: string;
  shiftStartMin?: number;
  shiftEndMin?: number;
  roleIds?: Array<number | string>;
  prefFirstHour?: string;
  prefFirstHourWeight?: number;
  prefTask?: string;
  prefTaskWeight?: number;
  consecutiveProdWeight?: number;
  consecutiveRegWeight?: number;
  prefBreakTiming?: number;
  prefBreakTimingWeight?: number;
};

export function registerCrewRoutes(app: FastifyInstance) {
  // Log current config for debugging/tuning
  console.log('Preference validation config:', PREFERENCE_CONFIG);

  const parsePreferenceTask = (value?: string): PrefenceTask | undefined => {
    if (!value) return undefined;
    const upper = value.toUpperCase();
    return PREFERENCE_CONFIG.validTasks.includes(upper as any)
      ? (upper as PrefenceTask)
      : undefined;
  };

  const validatePreferenceWeight = (weight?: number): boolean => {
    if (PREFERENCE_CONFIG.allowNegativeWeights) {
      return weight === undefined || typeof weight === 'number';
    }
    return weight === undefined ||
           (typeof weight === 'number' &&
            weight >= PREFERENCE_CONFIG.weightRange.min &&
            weight <= PREFERENCE_CONFIG.weightRange.max);
  };

  const validatePreferenceTask = (task?: string): boolean => {
    return task === undefined || parsePreferenceTask(task) !== undefined;
  };

  const crewInclude = {
    CrewRole: {
      include: {
        Role: true,
      },
    },
  } satisfies Prisma.CrewInclude;

  type CrewWithRoles = Prisma.CrewGetPayload<{ include: typeof crewInclude }>;

  const formatCrew = (crew: CrewWithRoles) => {
    const { CrewRole, ...rest } = crew;
    return {
      ...rest,
      roles: CrewRole.map((cr) => ({
        crewId: cr.crewId,
        roleId: cr.roleId,
        assignedAt: cr.assignedAt,
        specializationType: cr.specializationType,
        role: cr.Role,
      })),
    };
  };

  const normalizeRoleIds = (roleIds: Array<number | string> | undefined) =>
    roleIds?.map((id) => (typeof id === 'string' ? Number(id) : id)).filter((id): id is number => Number.isInteger(id));

  // GET /stores - list all stores
  app.get('/stores', async () => {
    const stores = await prisma.store.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, timezone: true },
    });
    return stores;
  });


  // POST /stores - create a store (explicit id + name; defaults for timezone/regHoursStartMin/regHoursEndMin)
  app.post<{ Body: { id: number; name: string; timezone?: string; regHoursStartMin?: number; regHoursEndMin?: number; startRegHour?: number; endRegHour?: number } }>('/stores', async (req, reply) => {
    const { id, name, timezone, regHoursStartMin, regHoursEndMin, startRegHour, endRegHour } = req.body;
    if (id === undefined || Number.isNaN(id)) {
      return reply.code(400).send({ error: 'id is required and must be a number' });
    }
    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }

    const startMinutes = regHoursStartMin ?? startRegHour;
    const endMinutes = regHoursEndMin ?? endRegHour;

    try {
      const store = await prisma.store.create({
        data: {
          id,
          name,
          ...(timezone !== undefined && { timezone }),
          ...(startMinutes !== undefined && { regHoursStartMin: startMinutes }),
          ...(endMinutes !== undefined && { regHoursEndMin: endMinutes }),
        },
      });
      return store;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'Store with this id already exists' });
      }
      console.error('Failed to create store', e);
      return reply.code(500).send({ error: 'Failed to create store' });
    }
  });

  // DELETE /stores/:id - remove a store (simple utility for cleanup while stabilizing defaults)
  app.delete<{ Params: { id: string } }>('/stores/:id', async (req, reply) => {
    const storeId = parseInt(req.params.id, 10);
    if (isNaN(storeId)) return reply.code(400).send({ error: 'Invalid store id' });
    const existing = await prisma.store.findUnique({ where: { id: storeId } });
    if (!existing) return reply.code(404).send({ error: 'Store not found' });
    await prisma.store.delete({ where: { id: storeId } });
    return { ok: true, deleted: storeId };
  });

  // POST /crew - create new crew member
  app.post<{ Body: CreateCrewBody }>('/crew', async (req, reply) => {
    const { 
      id,
      name, 
      storeId,
      shiftStartMin,
      shiftEndMin,
      roleIds = [],
      prefFirstHour,
      prefFirstHourWeight,
      prefTask,
      prefTaskWeight,
      consecutiveProdWeight,
      consecutiveRegWeight,
      prefBreakTiming,
      prefBreakTimingWeight,
    } = req.body;

    if (!id || typeof id !== 'string') {
      return reply.code(400).send({ error: 'id is required and must be a string' });
    }
    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }

    // Validate preference weights (0-4 range) - only for preference strength fields
    if (!validatePreferenceWeight(prefFirstHourWeight)) {
      return reply.code(400).send({ error: 'prefFirstHourWeight must be between 0 and 4' });
    }
    if (!validatePreferenceWeight(prefTaskWeight)) {
      return reply.code(400).send({ error: 'prefTaskWeight must be between 0 and 4' });
    }
    if (!validatePreferenceWeight(prefBreakTimingWeight)) {
      return reply.code(400).send({ error: 'prefBreakTimingWeight must be between 0 and 4' });
    }

    // Note: consecutiveProdWeight and consecutiveRegWeight are penalty weights, not preference strengths,
    // so they can be higher than 4

    // Validate preference task enums
    if (!validatePreferenceTask(prefFirstHour)) {
      return reply.code(400).send({ error: 'prefFirstHour must be REGISTER or PRODUCT' });
    }
    if (!validatePreferenceTask(prefTask)) {
      return reply.code(400).send({ error: 'prefTask must be REGISTER or PRODUCT' });
    }

    const resolvedStoreId = storeId ?? (await prisma.store.findFirst({ select: { id: true } }))?.id;
    if (!resolvedStoreId) {
      return reply.code(400).send({ error: 'storeId is required' });
    }

    try {
      const normalizedRoleIds = normalizeRoleIds(roleIds);
      
      // Fetch role details if we have roleIds, so we can populate crewName and roleName
      let roleData: Array<{ id: number; displayName: string }> = [];
      if (normalizedRoleIds && normalizedRoleIds.length > 0) {
        roleData = await prisma.role.findMany({
          where: { id: { in: normalizedRoleIds } },
          select: { id: true, displayName: true }
        });
      }
      
      const crew = await prisma.crew.create({
        data: {
          id,
          name,
          storeId: resolvedStoreId,
          // Only include optional fields if provided
          ...(shiftStartMin !== undefined && { shiftStartMin }),
          ...(shiftEndMin !== undefined && { shiftEndMin }),
          ...(prefFirstHour !== undefined && { prefFirstHour: parsePreferenceTask(prefFirstHour) }),
          ...(prefFirstHourWeight !== undefined && { prefFirstHourWeight }),
          ...(prefTask !== undefined && { prefTask: parsePreferenceTask(prefTask) }),
          ...(prefTaskWeight !== undefined && { prefTaskWeight }),
          ...(consecutiveProdWeight !== undefined && { consecutiveProdWeight }),
          ...(consecutiveRegWeight !== undefined && { consecutiveRegWeight }),
          ...(prefBreakTiming !== undefined && { prefBreakTiming }),
          ...(prefBreakTimingWeight !== undefined && { prefBreakTimingWeight }),
          CrewRole: roleData.length > 0 ? {
            create: roleData.map(role => ({ 
              roleId: role.id,
              roleName: role.displayName,
              crewName: name
            })),
          } : undefined,
        },
        include: crewInclude,
      });
      return formatCrew(crew);
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'Crew with this id already exists' });
      }
      console.error('Failed to create crew', e);
      return reply.code(500).send({ error: 'Failed to create crew' });
    }
  });

  // GET /crew - list or search crew
  app.get<{ Querystring: { id?: string; search?: string; storeId?: string } }>('/crew', async (req, reply) => {
    const { id, search, storeId } = req.query as any;

    if (id) {
      const crew = await prisma.crew.findUnique({
        where: { id: String(id) },
        include: crewInclude,
      });
      if (!crew) return reply.code(404).send({ error: 'Crew member not found' });
      return formatCrew(crew);
    }

    // Build filter conditions
    const where: any = {};
    if (search) {
      where.name = { contains: String(search), mode: 'insensitive' };
    }
    if (storeId) {
      const parsedStore = parseInt(String(storeId), 10);
      if (!Number.isNaN(parsedStore)) {
        where.storeId = parsedStore;
      }
    }

    const allCrew = await prisma.crew.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: crewInclude,
      orderBy: { name: 'asc' },
    });
    return allCrew.map(formatCrew);
  });

  // PUT /crew/:id - update a crew member
  app.put<{ Params: { id: string }; Body: UpdateCrewBody }>('/crew/:id', async (req, reply) => {
    const crewId = req.params.id;

    const { 
      name, 
      shiftStartMin,
      shiftEndMin,
      roleIds,
      prefFirstHour,
      prefFirstHourWeight,
      prefTask,
      prefTaskWeight,
      consecutiveProdWeight,
      consecutiveRegWeight,
      prefBreakTiming,
      prefBreakTimingWeight,
    } = req.body;

    // Validate preference weights (0-4 range) - only for preference strength fields
    if (!validatePreferenceWeight(prefFirstHourWeight)) {
      return reply.code(400).send({ error: 'prefFirstHourWeight must be between 0 and 4' });
    }
    if (!validatePreferenceWeight(prefTaskWeight)) {
      return reply.code(400).send({ error: 'prefTaskWeight must be between 0 and 4' });
    }
    if (!validatePreferenceWeight(prefBreakTimingWeight)) {
      return reply.code(400).send({ error: 'prefBreakTimingWeight must be between 0 and 4' });
    }

    // Note: consecutiveProdWeight and consecutiveRegWeight are penalty weights, not preference strengths,
    // so they can be higher than 4

    // Validate preference task enums
    if (!validatePreferenceTask(prefFirstHour)) {
      return reply.code(400).send({ error: 'prefFirstHour must be REGISTER or PRODUCT' });
    }
    if (!validatePreferenceTask(prefTask)) {
      return reply.code(400).send({ error: 'prefTask must be REGISTER or PRODUCT' });
    }

    const existing = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!existing) return reply.code(404).send({ error: 'Crew member not found' });

    const normalizedRoleIds = normalizeRoleIds(roleIds);
    
    // Fetch role details if we're replacing roles
    let roleUpdate: any = undefined;
    if (normalizedRoleIds !== undefined) {
      const roleData = await prisma.role.findMany({
        where: { id: { in: normalizedRoleIds } },
        select: { id: true, displayName: true }
      });
      
      roleUpdate = {
        deleteMany: {},
        create: roleData.map(role => ({ 
          roleId: role.id,
          roleName: role.displayName,
          crewName: name || existing.name  // Use new name if provided, else keep existing
        })),
      };
    }

    const updated = await prisma.crew.update({
      where: { id: crewId },
      data: {
        ...(name && { name }),
        ...(shiftStartMin !== undefined && { shiftStartMin }),
        ...(shiftEndMin !== undefined && { shiftEndMin }),
        ...(prefFirstHour !== undefined && { prefFirstHour: parsePreferenceTask(prefFirstHour) }),
        ...(prefFirstHourWeight !== undefined && { prefFirstHourWeight }),
        ...(prefTask !== undefined && { prefTask: parsePreferenceTask(prefTask) }),
        ...(prefTaskWeight !== undefined && { prefTaskWeight }),
        ...(consecutiveProdWeight !== undefined && { consecutiveProdWeight }),
        ...(consecutiveRegWeight !== undefined && { consecutiveRegWeight }),
        ...(prefBreakTiming !== undefined && { prefBreakTiming }),
        ...(prefBreakTimingWeight !== undefined && { prefBreakTimingWeight }),
        ...(roleUpdate && { CrewRole: roleUpdate }),
      },
      include: crewInclude,
    });

    return formatCrew(updated);
  });

  // POST /crew/:id/add-role - add a role to a crew member
  app.post<{ Params: { id: string }; Body: { roleCode: string } }>('/crew/:id/add-role', async (req, reply) => {
    const crewId = req.params.id;

    const { roleCode } = req.body;
    if (!roleCode) return reply.code(400).send({ error: 'roleCode is required' });

    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) return reply.code(404).send({ error: 'Crew member not found' });

    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) return reply.code(404).send({ error: 'Role not found' });

    const existingLink = await prisma.crewRole.findUnique({
      where: { crewId_roleId: { crewId, roleId: role.id } },
    });
    if (existingLink) {
      return reply.code(409).send({ error: 'Crew member already has this role' });
    }

    try {
    await prisma.crewRole.create({ 
      data: { 
        crewId, 
        roleId: role.id,
        crewName: crew.name,
        roleName: role.displayName
      } 
    });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'Crew member already has this role' });
      }
      throw e;
    }

    return reply.code(204).send();
  });

  // DELETE /crew/:id - delete a crew member
  app.delete<{ Params: { id: string } }>('/crew/:id', async (req, reply) => {
    const crewId = req.params.id;
    
    const existing = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!existing) return reply.code(404).send({ error: 'Crew member not found' });
    
    await prisma.crew.delete({ where: { id: crewId } });
    return { ok: true, deleted: crewId };
  });
}
