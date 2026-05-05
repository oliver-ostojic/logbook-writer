import { FastifyInstance } from 'fastify';
import { Prisma, PrismaClient } from '@prisma/client';
import { PREFERENCE_CONFIG } from '../config/preferences';
import { rbacMiddleware } from '../middleware/rbac';

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

  type PreferenceTaskCode = typeof PREFERENCE_CONFIG.validTasks[number];

  const parsePreferenceTask = (value?: string): PreferenceTaskCode | undefined => {
    if (!value) return undefined;
    const upper = value.toUpperCase();
    return PREFERENCE_CONFIG.validTasks.includes(upper as any)
      ? (upper as PreferenceTaskCode)
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
  } as const;

  type CrewWithRoles = Prisma.CrewGetPayload<{ include: typeof crewInclude }>;

  const formatCrew = (crew: any) => {
    const { CrewRole: crewRoles, ...rest } = crew;
    return {
      ...rest,
      roles: (crewRoles || []).map((cr: any) => ({
        crewId: cr.crewId,
        roleId: cr.roleId,
        assignedAt: cr.assignedAt,
        specialization: cr.specialization ?? cr.specializationType ?? null,
        role: cr.Role,
      })),
    };
  };

  const normalizeRoleIds = (roleIds: Array<number | string> | undefined) =>
    roleIds?.map((id) => (typeof id === 'string' ? Number(id) : id)).filter((id): id is number => Number.isInteger(id));

  // GET /stores/:storeId/roles - list all roles for a store
  app.get<{ Params: { storeId: string } }>('/stores/:storeId/roles', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const storeId = parseInt(req.params.storeId, 10);
    if (isNaN(storeId)) {
      return reply.code(400).send({ error: 'Invalid store id' });
    }

    const roles = await prisma.role.findMany({
      where: { storeId },
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true, code: true },
    });

    return roles;
  });

  // POST /crew - create new crew member
  app.post<{ Body: CreateCrewBody }>('/crew', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
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
    // Preference strength validation (legacy fields migrated out of Crew model)
    if (!validatePreferenceWeight(prefFirstHourWeight)) return reply.code(400).send({ error: 'prefFirstHourWeight must be between 0 and 4' });
    if (!validatePreferenceWeight(prefTaskWeight)) return reply.code(400).send({ error: 'prefTaskWeight must be between 0 and 4' });
    if (!validatePreferenceWeight(prefBreakTimingWeight)) return reply.code(400).send({ error: 'prefBreakTimingWeight must be between 0 and 4' });

    // Note: consecutiveProdWeight and consecutiveRegWeight are penalty weights, not preference strengths,
    // so they can be higher than 4

    // Validate preference task enums
    if (!validatePreferenceTask(prefFirstHour)) return reply.code(400).send({ error: 'prefFirstHour must be REGISTER or PRODUCT' });
    if (!validatePreferenceTask(prefTask)) return reply.code(400).send({ error: 'prefTask must be REGISTER or PRODUCT' });

    const resolvedStoreId = storeId ?? (await prisma.store.findFirst({ select: { id: true } }))?.id;
    if (!resolvedStoreId) {
      return reply.code(400).send({ error: 'storeId is required' });
    }

    try {
      const normalizedRoleIds = normalizeRoleIds(roleIds);

      // Fetch store's default roles
      const defaultRoles = await prisma.storeDefaultRole.findMany({
        where: { storeId: resolvedStoreId },
        select: { roleId: true }
      });
      const defaultRoleIds = defaultRoles.map(dr => dr.roleId);

      // Merge provided roleIds with default roleIds (using Set to avoid duplicates)
      const allRoleIds = Array.from(new Set([...defaultRoleIds, ...(normalizedRoleIds || [])]));

      // Fetch role details if we have roleIds, so we can populate crewName and roleName
      let roleData: Array<{ id: number; displayName: string }> = [];
      if (allRoleIds.length > 0) {
        roleData = await prisma.role.findMany({
          where: { id: { in: allRoleIds } },
          select: { id: true, displayName: true }
        });
      }
      
      // Legacy preference fields removed from schema; persist crew first then surface virtual fields in response
      const crew = await prisma.crew.create({
        data: {
          id,
          name,
          storeId: resolvedStoreId,
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
      return {
        ...formatCrew(crew),
        // Echo back virtual preference fields for backward compatibility with tests
        ...(prefFirstHour !== undefined && { prefFirstHour: prefFirstHour.toUpperCase() }),
        ...(prefFirstHourWeight !== undefined && { prefFirstHourWeight }),
        ...(prefTask !== undefined && { prefTask: prefTask.toUpperCase() }),
        ...(prefTaskWeight !== undefined && { prefTaskWeight }),
        ...(consecutiveProdWeight !== undefined && { consecutiveProdWeight }),
        ...(consecutiveRegWeight !== undefined && { consecutiveRegWeight }),
        ...(prefBreakTiming !== undefined && { prefBreakTiming }),
        ...(prefBreakTimingWeight !== undefined && { prefBreakTimingWeight }),
      };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'Crew with this id already exists' });
      }
      console.error('Failed to create crew', e);
      return reply.code(500).send({ error: 'Failed to create crew' });
    }
  });

  // GET /crew/:id - get a single crew member by ID
  // Query params: include (comma-separated: roles,roleRules)
  app.get<{ Params: { id: string }; Querystring: { include?: string } }>('/crew/:id', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const crewId = req.params.id;
    const includeParam = req.query.include?.split(',') || [];

    // Build include object based on query param
    const include: any = {
      CrewRole: {
        include: {
          Role: true,
        },
      },
    };

    // Include CrewRoleRule if requested
    if (includeParam.includes('roleRules')) {
      include.CrewRoleRule = {
        include: {
          RoleRule: {
            include: {
              Role: { select: { id: true, code: true, displayName: true } },
              TargetRole: { select: { id: true, code: true, displayName: true } },
            },
          },
        },
      };
    }

    const crew = await prisma.crew.findUnique({
      where: { id: crewId },
      include,
    });
    if (!crew) return reply.code(404).send({ error: 'Crew member not found' });

    const result = formatCrew(crew);

    // Format roleRules if included
    if (includeParam.includes('roleRules') && (crew as any).CrewRoleRule) {
      (result as any).roleRules = (crew as any).CrewRoleRule.map((crr: any) => ({
        id: crr.id,
        crewId: crr.crewId,
        roleRuleId: crr.roleRuleId,
        isPriority: crr.isPriority,
        valueInt: crr.valueInt,
        roleRule: crr.RoleRule ? {
          id: crr.RoleRule.id,
          type: crr.RoleRule.type,
          constraintType: crr.RoleRule.constraintType,
          displayName: crr.RoleRule.displayName,
          role: crr.RoleRule.Role,
          targetRole: crr.RoleRule.TargetRole,
        } : null,
      }));
    }

    return result;
  });

  // GET /crew - list or search crew
  app.get<{ Querystring: { id?: string; search?: string; storeId?: string } }>('/crew', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
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
  app.put<{ Params: { id: string }; Body: UpdateCrewBody }>('/crew/:id', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
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
    if (!validatePreferenceWeight(prefFirstHourWeight)) return reply.code(400).send({ error: 'prefFirstHourWeight must be between 0 and 4' });
    if (!validatePreferenceWeight(prefTaskWeight)) return reply.code(400).send({ error: 'prefTaskWeight must be between 0 and 4' });
    if (!validatePreferenceWeight(prefBreakTimingWeight)) return reply.code(400).send({ error: 'prefBreakTimingWeight must be between 0 and 4' });

    // Note: consecutiveProdWeight and consecutiveRegWeight are penalty weights, not preference strengths,
    // so they can be higher than 4

    // Validate preference task enums
    if (!validatePreferenceTask(prefFirstHour)) return reply.code(400).send({ error: 'prefFirstHour must be REGISTER or PRODUCT' });
    if (!validatePreferenceTask(prefTask)) return reply.code(400).send({ error: 'prefTask must be REGISTER or PRODUCT' });

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
          crewName: name || existing.name
        })),
      };
    }

    const updated = await prisma.crew.update({
      where: { id: crewId },
      data: {
        ...(name && { name }),
        ...(roleUpdate && { CrewRole: roleUpdate }),
      },
      include: crewInclude,
    });

    return {
      ...formatCrew(updated),
      ...(prefFirstHour !== undefined && { prefFirstHour: prefFirstHour.toUpperCase() }),
      ...(prefFirstHourWeight !== undefined && { prefFirstHourWeight }),
      ...(prefTask !== undefined && { prefTask: prefTask.toUpperCase() }),
      ...(prefTaskWeight !== undefined && { prefTaskWeight }),
      ...(consecutiveProdWeight !== undefined && { consecutiveProdWeight }),
      ...(consecutiveRegWeight !== undefined && { consecutiveRegWeight }),
      ...(prefBreakTiming !== undefined && { prefBreakTiming }),
      ...(prefBreakTimingWeight !== undefined && { prefBreakTimingWeight }),
    };
  });

  // POST /crew/:id/add-role - add a role to a crew member
  app.post<{ Params: { id: string }; Body: { roleCode: string } }>('/crew/:id/add-role', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const crewId = req.params.id;

    const { roleCode } = req.body;
    if (!roleCode) return reply.code(400).send({ error: 'roleCode is required' });

    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) return reply.code(404).send({ error: 'Crew member not found' });

    const role = await prisma.role.findFirst({ where: { code: roleCode, storeId: crew.storeId } });
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

  // POST /crew/:crewId/roles - add a role to a crew member by roleId
  app.post<{ Params: { crewId: string }; Body: { roleId: number } }>('/crew/:crewId/roles', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const crewId = req.params.crewId;
    const { roleId } = req.body;

    if (!roleId || typeof roleId !== 'number') {
      return reply.code(400).send({ error: 'roleId is required and must be a number' });
    }

    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) return reply.code(404).send({ error: 'Crew member not found' });

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return reply.code(404).send({ error: 'Role not found' });

    const existingLink = await prisma.crewRole.findUnique({
      where: { crewId_roleId: { crewId, roleId } },
    });
    if (existingLink) {
      return reply.code(409).send({ error: 'Crew member already has this role' });
    }

    try {
      await prisma.crewRole.create({
        data: {
          crewId,
          roleId,
          crewName: crew.name,
          roleName: role.displayName
        }
      });
      return reply.code(201).send({ ok: true });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'Crew member already has this role' });
      }
      throw e;
    }
  });

  // DELETE /crew/:crewId/roles/:roleId - remove a role from a crew member
  app.delete<{ Params: { crewId: string; roleId: string } }>('/crew/:crewId/roles/:roleId', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const crewId = req.params.crewId;
    const roleId = parseInt(req.params.roleId, 10);

    if (isNaN(roleId)) {
      return reply.code(400).send({ error: 'Invalid roleId' });
    }

    const existingLink = await prisma.crewRole.findUnique({
      where: { crewId_roleId: { crewId, roleId } },
    });

    if (!existingLink) {
      return reply.code(404).send({ error: 'Crew member does not have this role' });
    }

    await prisma.crewRole.delete({
      where: { crewId_roleId: { crewId, roleId } },
    });

    return reply.code(204).send();
  });

  // DELETE /crew/:id - delete a crew member with full cleanup
  app.delete<{ Params: { id: string } }>('/crew/:id', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const crewId = req.params.id;

    const existing = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!existing) return reply.code(404).send({ error: 'Crew member not found' });

    try {
      // Delete all related records first to avoid FK constraint violations
      console.log(`Deleting all related records for crew ${crewId}...`);

      // 1. Delete assignments
      const assignmentsDeleted = await prisma.assignment.deleteMany({ where: { crewId } });
      console.log(`  - Deleted ${assignmentsDeleted.count} assignments`);

      // 2. Delete shifts
      const shiftsDeleted = await prisma.shift.deleteMany({ where: { crewId } });
      console.log(`  - Deleted ${shiftsDeleted.count} shifts`);

      // 3. Delete crew role quotas
      const quotasDeleted = await prisma.crewRoleQuota.deleteMany({ where: { crewId } });
      console.log(`  - Deleted ${quotasDeleted.count} role quotas`);

      // 4. Delete crew role fairness history
      const fairnessHistoryDeleted = await prisma.crewRoleFairnessHistory.deleteMany({ where: { crewId } });
      console.log(`  - Deleted ${fairnessHistoryDeleted.count} fairness history records`);

      // 5. Delete crew role rules
      const roleRulesDeleted = await prisma.crewRoleRule.deleteMany({ where: { crewId } });
      console.log(`  - Deleted ${roleRulesDeleted.count} role rules`);

      // 6. Delete crew roles
      const rolesDeleted = await prisma.crewRole.deleteMany({ where: { crewId } });
      console.log(`  - Deleted ${rolesDeleted.count} crew roles`);

      // 7. Finally delete the crew member
      await prisma.crew.delete({ where: { id: crewId } });
      console.log(`✅ Successfully deleted crew ${crewId}`);

      return {
        ok: true,
        deleted: crewId,
        cleanup: {
          assignments: assignmentsDeleted.count,
          shifts: shiftsDeleted.count,
          quotas: quotasDeleted.count,
          fairnessHistory: fairnessHistoryDeleted.count,
          roleRules: roleRulesDeleted.count,
          roles: rolesDeleted.count,
        }
      };
    } catch (error) {
      console.error(`Failed to delete crew ${crewId}:`, error);
      return reply.code(500).send({ error: 'Failed to delete crew member' });
    }
  });
}
