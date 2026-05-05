import { FastifyInstance } from 'fastify';
import { Prisma, PrismaClient, AssignmentModel, ConsecutivePolicy } from '@prisma/client';
import { rbacMiddleware } from '../middleware/rbac';

const prisma = new PrismaClient();

type CreateRoleBody = {
  code?: string;
  name?: string; // legacy alias for code
  displayName?: string;
  storeId?: number;
  assignmentModel?: AssignmentModel;
  consecutivePolicy?: ConsecutivePolicy;
  taskLength?: number;
  familyId?: number;
  codePDF?: string;
  allowOutsideStoreHours?: boolean;
};

type UpdateRoleBody = {
  removeCrewMemberId: string;
};

type PatchRoleBody = {
  code?: string;
  displayName?: string;
  assignmentModel?: AssignmentModel;
  consecutivePolicy?: ConsecutivePolicy;
  taskLength?: number;
  familyId?: number;
  codePDF?: string;
  allowOutsideStoreHours?: boolean;
  windowStartOffsetMin?: number;
  windowEndOffsetMin?: number;
};

export function registerRoleRoutes(app: FastifyInstance) {
  const roleInclude = {
    CrewRole: {
      include: {
        Crew: { select: { id: true, name: true } },
      },
    },
  } satisfies Prisma.RoleInclude;

  type RoleWithCrew = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

  const formatRole = (role: RoleWithCrew) => {
    const { CrewRole, ...rest } = role as any;
    return {
      ...rest,
      crewMembers: (CrewRole ?? []).map((cr: any) => ({
        crewId: cr.crewId,
        crewMember: cr.Crew,
        roleId: cr.roleId,
        assignedAt: cr.assignedAt,
        specialization: (cr as any).specialization ?? null,
      })),
    };
  };

  // Create a new role
  app.post<{ Body: CreateRoleBody }>('/roles', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    console.log('=== POST /roles ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const {
      code,
      name,
      displayName,
      storeId,
      assignmentModel,
      consecutivePolicy,
      taskLength,
      familyId,
      codePDF,
      allowOutsideStoreHours,
    } = req.body;

    const resolvedCode = code ?? name;
    if (!resolvedCode) {
      console.error('Validation failed: No code provided');
      return reply.code(400).send({ error: 'code is required' });
    }
    if (storeId === undefined) {
      console.error('Validation failed: No storeId provided');
      return reply.code(400).send({ error: 'storeId is required' });
    }

    console.log('Creating role with data:', {
      code: resolvedCode,
      codePDF: codePDF ?? resolvedCode,
      displayName: displayName ?? resolvedCode,
      storeId,
      assignmentModel: assignmentModel ?? AssignmentModel.HOURLY,
      consecutivePolicy: consecutivePolicy ?? 'NONE',
      taskLength: taskLength ?? 30,
      familyId: familyId ?? 1,
      allowOutsideStoreHours: allowOutsideStoreHours ?? false,
    });

    try {
      const role = await prisma.role.create({
        data: {
          code: resolvedCode,
          codePDF: codePDF ?? resolvedCode,
          displayName: displayName ?? resolvedCode,
          storeId,
          assignmentModel: assignmentModel ?? AssignmentModel.HOURLY,
          consecutivePolicy: (consecutivePolicy ?? 'NONE') as ConsecutivePolicy,
          taskLength: taskLength ?? 30,
          // Default familyId to 1 if not provided. In production you probably want
          // to require this or pick the store's default family.
          familyId: familyId ?? 1,
          allowOutsideStoreHours: allowOutsideStoreHours ?? false,
        },
        include: roleInclude,
      });
      console.log('Role created successfully:', role.id);
      const formatted = formatRole(role as RoleWithCrew);
      console.log('Returning formatted role:', JSON.stringify(formatted, null, 2));
      return formatted;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        console.error('Duplicate role detected');
        return reply.code(409).send({ error: 'Role with this code already exists' });
      }
      console.error('Failed to create role', e);
      return reply.code(500).send({ error: 'Failed to create role' });
    }
  });

  // Read all roles or a specific one by id
  app.get<{ Querystring: { id?: string; storeId?: string } }>('/roles', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id, storeId } = req.query as any;
    if (id) {
      const roleId = Number(id);
      if (Number.isNaN(roleId)) {
        return reply.code(400).send({ error: 'id must be a number' });
      }
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        include: roleInclude,
      });
      if (!role) return reply.code(404).send({ error: 'Role not found' });
      return formatRole(role as RoleWithCrew);
    }
    const where = storeId ? { storeId: Number(storeId) } : {};
    const allRoles = await prisma.role.findMany({ where, include: roleInclude });
    return allRoles.map((r) => formatRole(r as RoleWithCrew));
  });

  // List crew (id, name) for a role by its id
  app.get<{ Params: { name: string } }>('/roles/:name/crew', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { name } = req.params;
    const roleId = Number(name);
    const role = Number.isNaN(roleId)
      ? await prisma.role.findFirst({ where: { code: name }, include: roleInclude })
      : await prisma.role.findUnique({ where: { id: roleId }, include: roleInclude });
    if (!role) return reply.code(404).send({ error: 'Role not found' });
    const crew = (role as any).CrewRole.map((cr: any) => cr.Crew);
    return crew;
  });

  // Update a role (only remove crew members)
  app.put<{ Params: { id: string }; Body: UpdateRoleBody }>('/roles/:id', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id } = req.params;
    const { removeCrewMemberId } = req.body;
    if (!removeCrewMemberId) {
      return reply.code(400).send({ error: 'removeCrewMemberId is required' });
    }
    const roleId = Number(id);
    if (Number.isNaN(roleId)) {
      return reply.code(400).send({ error: 'id must be a number' });
    }
    const existing = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existing) return reply.code(404).send({ error: 'Role not found' });

    await prisma.crewRole.deleteMany({
      where: { roleId, crewId: removeCrewMemberId },
    });
    const updated = await prisma.role.findUnique({ where: { id: roleId }, include: roleInclude });
    return updated ? formatRole(updated as RoleWithCrew) : null;
  });

  // POST /roles/:roleId/crew - add crew to role
  app.post<{ Params: { roleId: string }; Body: { crewId: string } }>('/roles/:roleId/crew', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const roleId = parseInt(req.params.roleId, 10);
    const { crewId } = req.body;

    if (!crewId || typeof crewId !== 'string') {
      return reply.code(400).send({ error: 'crewId is required and must be a string' });
    }

    if (isNaN(roleId)) {
      return reply.code(400).send({ error: 'Invalid role id' });
    }

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return reply.code(404).send({ error: 'Role not found' });

    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) return reply.code(404).send({ error: 'Crew member not found' });

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
          roleName: role.displayName,
        },
      });
      return reply.code(201).send({ ok: true });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'Crew member already has this role' });
      }
      throw e;
    }
  });

  // DELETE /roles/:roleId/crew/:crewId - remove crew from role
  app.delete<{ Params: { roleId: string; crewId: string } }>('/roles/:roleId/crew/:crewId', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const roleId = parseInt(req.params.roleId, 10);
    const crewId = req.params.crewId;

    if (isNaN(roleId)) {
      return reply.code(400).send({ error: 'Invalid role id' });
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

  // Delete a role
  app.delete<{ Params: { id: string } }>('/roles/:id', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id } = req.params;
    const roleId = Number(id);
    if (Number.isNaN(roleId)) {
      return reply.code(400).send({ error: 'id must be a number' });
    }
    const existing = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existing) return reply.code(404).send({ error: 'Role not found' });
    await prisma.role.delete({ where: { id: roleId } });
    return { ok: true, deleted: roleId };
  });

  // PATCH a role - update specific fields
  app.patch<{ Params: { id: string }; Body: PatchRoleBody }>('/roles/:id', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id } = req.params;
    const roleId = Number(id);
    if (Number.isNaN(roleId)) {
      return reply.code(400).send({ error: 'id must be a number' });
    }

    const existing = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existing) return reply.code(404).send({ error: 'Role not found' });

    const {
      code,
      displayName,
      assignmentModel,
      consecutivePolicy,
      taskLength,
      familyId,
      codePDF,
      allowOutsideStoreHours,
      windowStartOffsetMin,
      windowEndOffsetMin,
    } = req.body;

    // Build update data with only provided fields
    const updateData: any = {};
    if (code !== undefined) updateData.code = code;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (assignmentModel !== undefined) updateData.assignmentModel = assignmentModel;
    if (consecutivePolicy !== undefined) updateData.consecutivePolicy = consecutivePolicy;
    if (taskLength !== undefined) updateData.taskLength = taskLength;
    if (familyId !== undefined) updateData.familyId = familyId;
    if (codePDF !== undefined) updateData.codePDF = codePDF;
    if (allowOutsideStoreHours !== undefined) updateData.allowOutsideStoreHours = allowOutsideStoreHours;
    if (windowStartOffsetMin !== undefined) updateData.windowStartOffsetMin = windowStartOffsetMin;
    if (windowEndOffsetMin !== undefined) updateData.windowEndOffsetMin = windowEndOffsetMin;

    if (Object.keys(updateData).length === 0) {
      return reply.code(400).send({ error: 'No fields to update' });
    }

    try {
      const updated = await prisma.role.update({
        where: { id: roleId },
        data: updateData,
        include: roleInclude,
      });
      return formatRole(updated as RoleWithCrew);
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'Role with this code already exists' });
      }
      console.error('Failed to update role', e);
      return reply.code(500).send({ error: 'Failed to update role' });
    }
  });

  // ============ ROLE FAMILY ENDPOINTS ============

  // GET /role-families - List all role families
  app.get<{ Querystring: { companyId?: string } }>('/role-families', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { companyId } = req.query;
    const where: any = {};
    if (companyId) {
      where.companyId = Number(companyId);
    }

    const families = await prisma.roleFamily.findMany({
      where,
      include: {
        Role: {
          select: { id: true, code: true, displayName: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return families.map(f => ({
      id: f.id,
      name: f.name,
      displayName: f.displayName,
      minMinutes: f.minMinutes,
      maxMinutes: f.maxMinutes,
      companyId: f.companyId,
      roleCount: f.Role.length,
      roles: f.Role,
    }));
  });

  // GET /role-families/:id - Get a specific role family with its roles
  app.get<{ Params: { id: string } }>('/role-families/:id', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id } = req.params;
    const familyId = Number(id);
    if (Number.isNaN(familyId)) {
      return reply.code(400).send({ error: 'id must be a number' });
    }

    const family = await prisma.roleFamily.findUnique({
      where: { id: familyId },
      include: {
        Role: {
          include: roleInclude,
          orderBy: { displayName: 'asc' },
        },
      },
    });

    if (!family) {
      return reply.code(404).send({ error: 'Role family not found' });
    }

    return {
      id: family.id,
      name: family.name,
      displayName: family.displayName,
      minMinutes: family.minMinutes,
      maxMinutes: family.maxMinutes,
      companyId: family.companyId,
      roles: family.Role.map(r => formatRole(r as RoleWithCrew)),
    };
  });

  // GET /role-families/:id/roles - Get roles in a family
  app.get<{ Params: { id: string } }>('/role-families/:id/roles', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id } = req.params;
    const familyId = Number(id);
    if (Number.isNaN(familyId)) {
      return reply.code(400).send({ error: 'id must be a number' });
    }

    const family = await prisma.roleFamily.findUnique({ where: { id: familyId } });
    if (!family) {
      return reply.code(404).send({ error: 'Role family not found' });
    }

    const roles = await prisma.role.findMany({
      where: { familyId },
      include: roleInclude,
      orderBy: { displayName: 'asc' },
    });

    return {
      familyId: family.id,
      familyName: family.name,
      roles: roles.map(r => formatRole(r as RoleWithCrew)),
    };
  });

  // PUT /role-families/:id/roles - Add a role to a family (update role's familyId)
  app.put<{ Params: { id: string }; Body: { roleId: number } }>('/role-families/:id/roles', { preHandler: rbacMiddleware({ allowedRoles: ['CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id } = req.params;
    const { roleId } = req.body;

    const familyId = Number(id);
    if (Number.isNaN(familyId)) {
      return reply.code(400).send({ error: 'id must be a number' });
    }
    if (!roleId) {
      return reply.code(400).send({ error: 'roleId is required' });
    }

    const [family, role] = await Promise.all([
      prisma.roleFamily.findUnique({ where: { id: familyId } }),
      prisma.role.findUnique({ where: { id: roleId } }),
    ]);

    if (!family) {
      return reply.code(404).send({ error: 'Role family not found' });
    }
    if (!role) {
      return reply.code(404).send({ error: 'Role not found' });
    }

    const updated = await prisma.role.update({
      where: { id: roleId },
      data: { familyId },
      include: roleInclude,
    });

    return {
      success: true,
      role: formatRole(updated as RoleWithCrew),
      message: `Role ${role.displayName} added to family ${family.name}`,
    };
  });

  // DELETE /role-families/:id/roles/:roleId - Remove a role from a family (set to default family 1)
  app.delete<{ Params: { id: string; roleId: string } }>('/role-families/:id/roles/:roleId', { preHandler: rbacMiddleware({ allowedRoles: ['CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id, roleId: roleIdStr } = req.params;

    const familyId = Number(id);
    const roleId = Number(roleIdStr);
    if (Number.isNaN(familyId) || Number.isNaN(roleId)) {
      return reply.code(400).send({ error: 'id and roleId must be numbers' });
    }

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return reply.code(404).send({ error: 'Role not found' });
    }
    if (role.familyId !== familyId) {
      return reply.code(400).send({ error: 'Role is not in this family' });
    }

    // Set role to default family (id: 1)
    const updated = await prisma.role.update({
      where: { id: roleId },
      data: { familyId: 1 },
      include: roleInclude,
    });

    return {
      success: true,
      role: formatRole(updated as RoleWithCrew),
      message: `Role ${role.displayName} removed from family`,
    };
  });

  // POST /role-families - Create a new role family
  app.post<{ Body: { name: string; displayName?: string; minMinutes: number; maxMinutes: number; companyId: number } }>('/role-families', { preHandler: rbacMiddleware({ allowedRoles: ['CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { name, displayName, minMinutes, maxMinutes, companyId } = req.body;

    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }
    if (!companyId) {
      return reply.code(400).send({ error: 'companyId is required' });
    }

    try {
      const family = await prisma.roleFamily.create({
        data: {
          name,
          displayName: displayName ?? name, // Default to name if not provided
          minMinutes: minMinutes ?? 0,
          maxMinutes: maxMinutes ?? 480,
          companyId,
        },
      });

      return {
        id: family.id,
        name: family.name,
        displayName: family.displayName,
        minMinutes: family.minMinutes,
        maxMinutes: family.maxMinutes,
        companyId: family.companyId,
        roleCount: 0,
        roles: [],
      };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'Role family with this name already exists' });
      }
      console.error('Failed to create role family', e);
      return reply.code(500).send({ error: 'Failed to create role family' });
    }
  });

  // PATCH /role-families/:id - Update a role family
  app.patch<{ Params: { id: string }; Body: { displayName?: string; minMinutes?: number; maxMinutes?: number } }>('/role-families/:id', { preHandler: rbacMiddleware({ allowedRoles: ['CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id } = req.params;
    const familyId = Number(id);
    if (Number.isNaN(familyId)) {
      return reply.code(400).send({ error: 'id must be a number' });
    }

    const existing = await prisma.roleFamily.findUnique({ where: { id: familyId } });
    if (!existing) {
      return reply.code(404).send({ error: 'Role family not found' });
    }

    const { displayName, minMinutes, maxMinutes } = req.body;

    // Build update data with only provided fields
    const updateData: any = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (minMinutes !== undefined) updateData.minMinutes = minMinutes;
    if (maxMinutes !== undefined) updateData.maxMinutes = maxMinutes;

    if (Object.keys(updateData).length === 0) {
      return reply.code(400).send({ error: 'No fields to update' });
    }

    try {
      const updated = await prisma.roleFamily.update({
        where: { id: familyId },
        data: updateData,
        include: {
          Role: {
            select: { id: true, code: true, displayName: true },
          },
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        displayName: updated.displayName,
        minMinutes: updated.minMinutes,
        maxMinutes: updated.maxMinutes,
        companyId: updated.companyId,
        roleCount: updated.Role.length,
        roles: updated.Role,
      };
    } catch (e: any) {
      console.error('Failed to update role family', e);
      return reply.code(500).send({ error: 'Failed to update role family' });
    }
  });

  // DELETE /role-families/:id - Delete a role family
  app.delete<{ Params: { id: string } }>('/role-families/:id', { preHandler: rbacMiddleware({ allowedRoles: ['CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id } = req.params;
    const familyId = Number(id);
    if (Number.isNaN(familyId)) {
      return reply.code(400).send({ error: 'id must be a number' });
    }

    const existing = await prisma.roleFamily.findUnique({
      where: { id: familyId },
      include: { Role: true },
    });

    if (!existing) {
      return reply.code(404).send({ error: 'Role family not found' });
    }

    // Check if any roles are using this family
    if (existing.Role.length > 0) {
      return reply.code(400).send({
        error: 'Cannot delete role family with roles assigned. Please reassign or remove all roles first.',
        roleCount: existing.Role.length,
      });
    }

    try {
      await prisma.roleFamily.delete({
        where: { id: familyId },
      });

      return {
        success: true,
        message: `Role family "${existing.displayName}" deleted successfully`,
      };
    } catch (e: any) {
      console.error('Failed to delete role family', e);
      return reply.code(500).send({ error: 'Failed to delete role family' });
    }
  });
}
