import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type CreateCrewBody = {
  id: string;
  name: string;
  blockSize: number;
  roleIds?: string[];
  taskPreference?: string;
  canBreak?: boolean;
  canParkingHelms?: boolean;
};

type UpdateCrewBody = {
  name?: string;
  blockSize?: number;
  roleIds?: string[];
  taskPreference?: string;
  canBreak?: boolean;
  canParkingHelms?: boolean;
};

export function registerCrewRoutes(app: FastifyInstance) {
  // Create a new crew member
  app.post<{ Body: CreateCrewBody }>('/crew', async (req, reply) => {
    const { id, name, blockSize, roleIds = [], taskPreference, canBreak, canParkingHelms } = req.body;
    
    if (!id || !name || !blockSize) {
      return reply.code(400).send({ error: 'id, name, and blockSize are required' });
    }
    
    const crew = await prisma.crewMember.create({
      data: {
        id,
        name,
        blockSize,
        taskPreference: taskPreference as any,
        canBreak: canBreak ?? true,
        canParkingHelms: canParkingHelms ?? true,
        roles: {
          create: roleIds.map(roleId => ({ roleId })),
        },
      },
      include: { roles: { include: { role: true } } },
    });
    
    return crew;
  });

  // Read all crew members or a specific one by id
  app.get<{ Querystring: { id?: string } }>('/crew', async (req, reply) => {
    const { id } = req.query as any;
    
    if (id) {
      const crew = await prisma.crewMember.findUnique({
        where: { id },
        include: { roles: { include: { role: true } } },
      });
      if (!crew) return reply.code(404).send({ error: 'Crew member not found' });
      return crew;
    }
    
    const allCrew = await prisma.crewMember.findMany({
      include: { roles: { include: { role: true } } },
    });
    return allCrew;
  });

  // Update a crew member
  app.put<{ Params: { id: string }; Body: UpdateCrewBody }>('/crew/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, blockSize, roleIds, taskPreference, canBreak, canParkingHelms } = req.body;
    
    const existing = await prisma.crewMember.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Crew member not found' });
    
    // If roleIds provided, replace all roles
    const roleUpdate = roleIds !== undefined ? {
      deleteMany: {},
      create: roleIds.map(roleId => ({ roleId })),
    } : undefined;
    
    const updated = await prisma.crewMember.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(blockSize && { blockSize }),
        ...(taskPreference !== undefined && { taskPreference: taskPreference as any }),
        ...(canBreak !== undefined && { canBreak }),
        ...(canParkingHelms !== undefined && { canParkingHelms }),
        ...(roleUpdate && { roles: roleUpdate }),
      },
      include: { roles: { include: { role: true } } },
    });
    
    return updated;
  });

  // Delete a crew member
  app.delete<{ Params: { id: string } }>('/crew/:id', async (req, reply) => {
    const { id } = req.params;
    
    const existing = await prisma.crewMember.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Crew member not found' });
    
    await prisma.crewMember.delete({ where: { id } });
    return { ok: true, deleted: id };
  });
}
