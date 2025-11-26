import { FastifyInstance } from 'fastify';
import { Prisma, PrismaClient, AssignmentModel } from '@prisma/client';

const prisma = new PrismaClient();

type CreateRoleBody = {
  code?: string;
  name?: string; // legacy alias for code
  displayName?: string;
  storeId?: number;
  assignmentModel?: AssignmentModel;
  slotsMustBeConsecutive?: boolean;
  minSlots?: number;
  maxSlots?: number;
  allowOutsideStoreHours?: boolean;
};

type UpdateRoleBody = {
  removeCrewMemberId: string;
};

export function registerRoleRoutes(app: FastifyInstance) {
  const roleInclude = {
    crewRoles: {
      include: {
        crew: { select: { id: true, name: true } },
      },
    },
  } satisfies Prisma.RoleInclude;

  type RoleWithCrew = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

  const formatRole = (role: RoleWithCrew) => {
    const { crewRoles, ...rest } = role;
    return {
      ...rest,
      crewMembers: crewRoles.map((cr) => ({
        crewId: cr.crewId,
        crewMember: cr.crew,
        roleId: cr.roleId,
        assignedAt: cr.assignedAt,
        specialization: cr.specializationType,
      })),
    };
  };

  // Create a new role
  app.post<{ Body: CreateRoleBody }>('/roles', async (req, reply) => {
    const {
      code,
      name,
      displayName,
      storeId,
      assignmentModel,
      slotsMustBeConsecutive,
      minSlots,
      maxSlots,
      allowOutsideStoreHours,
    } = req.body;

    const resolvedCode = code ?? name;
    if (!resolvedCode) {
      return reply.code(400).send({ error: 'code is required' });
    }
    
    if (storeId === undefined) {
      return reply.code(400).send({ error: 'storeId is required' });
    }
    
    const role = await prisma.role.create({
      data: {
        code: resolvedCode,
        displayName: displayName ?? resolvedCode,
        storeId,
        assignmentModel: assignmentModel ?? 'UNIVERSAL',
        slotsMustBeConsecutive: slotsMustBeConsecutive ?? false,
        minSlots: minSlots ?? 1,
        maxSlots: maxSlots ?? 1,
        allowOutsideStoreHours: allowOutsideStoreHours ?? false,
      },
      include: roleInclude,
    });
    
    return formatRole(role);
  });

  // Read all roles or a specific one by id
  app.get<{ Querystring: { id?: string } }>('/roles', async (req, reply) => {
    const { id } = req.query as any;
    
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
      return formatRole(role);
    }
    
    const allRoles = await prisma.role.findMany({
      include: roleInclude,
    });
    return allRoles.map(formatRole);
  });

  // List crew (id, name) for a role by its name
  app.get<{ Params: { name: string } }>('/roles/:name/crew', async (req, reply) => {
    const { name } = req.params;
    const role = await prisma.role.findUnique({
      where: { code: name },
      include: roleInclude,
    });
    if (!role) return reply.code(404).send({ error: 'Role not found' });
    const crew = role.crewRoles.map((cr) => cr.crew);
    return crew;
  });

  // Update a role (only remove crew members)
  app.put<{ Params: { id: string }; Body: UpdateRoleBody }>('/roles/:id', async (req, reply) => {
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
    
    // Remove the crew member from this role
    await prisma.crewRole.deleteMany({
      where: {
        roleId,
        crewId: removeCrewMemberId,
      },
    });
    
    const updated = await prisma.role.findUnique({
      where: { id: roleId },
      include: roleInclude,
    });
    
    return updated ? formatRole(updated) : null;
  });

  // Delete a role
  app.delete<{ Params: { id: string } }>('/roles/:id', async (req, reply) => {
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
}
