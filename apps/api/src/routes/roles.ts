import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type CreateRoleBody = {
  name: string;
};

type UpdateRoleBody = {
  removeCrewMemberId: string;
};

export function registerRoleRoutes(app: FastifyInstance) {
  // Create a new role
  app.post<{ Body: CreateRoleBody }>('/roles', async (req, reply) => {
    const { name } = req.body;
    
    if (!name) {
      return reply.code(400).send({ error: 'name is required' });
    }
    
    const role = await prisma.role.create({
      data: {
        name,
      },
      include: { crewMembers: { include: { crewMember: true } } },
    });
    
    return role;
  });

  // Read all roles or a specific one by id
  app.get<{ Querystring: { id?: string } }>('/roles', async (req, reply) => {
    const { id } = req.query as any;
    
    if (id) {
      const role = await prisma.role.findUnique({
        where: { id },
        include: { crewMembers: { include: { crewMember: true } } },
      });
      if (!role) return reply.code(404).send({ error: 'Role not found' });
      return role;
    }
    
    const allRoles = await prisma.role.findMany({
      include: { crewMembers: { include: { crewMember: true } } },
    });
    return allRoles;
  });

  // List crew (id, name) for a role by its name
  app.get<{ Params: { name: string } }>('/roles/:name/crew', async (req, reply) => {
    const { name } = req.params;
    const role = await prisma.role.findUnique({
      where: { name },
      include: { crewMembers: { include: { crewMember: { select: { id: true, name: true } } } } },
    });
    if (!role) return reply.code(404).send({ error: 'Role not found' });
    const crew = role.crewMembers.map(cm => cm.crewMember);
    return crew;
  });

  // Update a role (only remove crew members)
  app.put<{ Params: { id: string }; Body: UpdateRoleBody }>('/roles/:id', async (req, reply) => {
    const { id } = req.params;
    const { removeCrewMemberId } = req.body;
    
    if (!removeCrewMemberId) {
      return reply.code(400).send({ error: 'removeCrewMemberId is required' });
    }
    
    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Role not found' });
    
    // Remove the crew member from this role
    await prisma.crewMemberRole.deleteMany({
      where: {
        roleId: id,
        crewMemberId: removeCrewMemberId,
      },
    });
    
    const updated = await prisma.role.findUnique({
      where: { id },
      include: { crewMembers: { include: { crewMember: true } } },
    });
    
    return updated;
  });

  // Delete a role
  app.delete<{ Params: { id: string } }>('/roles/:id', async (req, reply) => {
    const { id } = req.params;
    
    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Role not found' });
    
    await prisma.role.delete({ where: { id } });
    return { ok: true, deleted: id };
  });
}
