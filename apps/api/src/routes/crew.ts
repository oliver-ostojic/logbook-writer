import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type CreateCrewBody = {
  id: string;
  name: string;
  storeId?: number;
  roleIds?: string[];
  taskPreference?: string;
  firstHourPreference?: string;
  canBreak?: boolean;
  canParkingHelms?: boolean;
  // preference weights
  prefFirstHourWeight?: number;
  prefTaskWeight?: number;
  prefBlocksizeProdWeight?: number;
  prefBlocksizeRegWeight?: number;
  // preference values
  prefFirstHour?: string; // TaskType
  prefTask?: string; // TaskType
  prefBlocksizeProd?: number;
  prefBlocksizeReg?: number;
};

type UpdateCrewBody = {
  name?: string;
  roleIds?: string[];
  taskPreference?: string;
  firstHourPreference?: string;
  canBreak?: boolean;
  canParkingHelms?: boolean;
  prefFirstHourWeight?: number;
  prefTaskWeight?: number;
  prefBlocksizeProdWeight?: number;
  prefBlocksizeRegWeight?: number;
  prefFirstHour?: string;
  prefTask?: string;
  prefBlocksizeProd?: number;
  prefBlocksizeReg?: number;
};

type PreferenceUpdateBody = {
  prefFirstHourWeight?: number;
  prefTaskWeight?: number;
  prefBlocksizeProdWeight?: number;
  prefBlocksizeRegWeight?: number;
  prefFirstHour?: string;
  prefTask?: string;
  prefBlocksizeProd?: number;
  prefBlocksizeReg?: number;
  firstHourPreference?: string;
  taskPreference?: string;
};

export function registerCrewRoutes(app: FastifyInstance) {
  // Create a new crew member
  app.post<{ Body: CreateCrewBody }>('/crew', async (req, reply) => {
    const { id, name, storeId = 768, roleIds = [], taskPreference, firstHourPreference, canBreak, canParkingHelms,
      prefFirstHourWeight, prefTaskWeight, prefBlocksizeProdWeight, prefBlocksizeRegWeight,
      prefFirstHour, prefTask, prefBlocksizeProd, prefBlocksizeReg } = req.body;

    if (!id || !name) {
      return reply.code(400).send({ error: 'id and name are required' });
    }

    const crew = await prisma.crewMember.create({
      data: {
        id,
        name,
        storeId,
        taskPreference: taskPreference as any,
        firstHourPreference: firstHourPreference as any,
        prefFirstHourWeight,
        prefTaskWeight,
        prefBlocksizeProdWeight,
        prefBlocksizeRegWeight,
        prefFirstHour: prefFirstHour as any,
        prefTask: prefTask as any,
        prefBlocksizeProd,
        prefBlocksizeReg,
        canBreak: canBreak ?? true,
        canParkingHelms: canParkingHelms ?? true,
        roles: {
          create: roleIds.map(roleId => ({ roleId })),
        },
      } as any,
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
    const { name, roleIds, taskPreference, firstHourPreference, canBreak, canParkingHelms,
      prefFirstHourWeight, prefTaskWeight, prefBlocksizeProdWeight, prefBlocksizeRegWeight,
      prefFirstHour, prefTask, prefBlocksizeProd, prefBlocksizeReg } = req.body;

    const existing = await prisma.crewMember.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Crew member not found' });

    const roleUpdate = roleIds !== undefined ? {
      deleteMany: {},
      create: roleIds.map(roleId => ({ roleId })),
    } : undefined;

    const updated = await prisma.crewMember.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(taskPreference !== undefined && { taskPreference: taskPreference as any }),
        ...(firstHourPreference !== undefined && { firstHourPreference: firstHourPreference as any }),
        ...(prefFirstHourWeight !== undefined && { prefFirstHourWeight }),
        ...(prefTaskWeight !== undefined && { prefTaskWeight }),
        ...(prefBlocksizeProdWeight !== undefined && { prefBlocksizeProdWeight }),
        ...(prefBlocksizeRegWeight !== undefined && { prefBlocksizeRegWeight }),
        ...(prefFirstHour !== undefined && { prefFirstHour: prefFirstHour as any }),
        ...(prefTask !== undefined && { prefTask: prefTask as any }),
        ...(prefBlocksizeProd !== undefined && { prefBlocksizeProd }),
        ...(prefBlocksizeReg !== undefined && { prefBlocksizeReg }),
        ...(canBreak !== undefined && { canBreak }),
        ...(canParkingHelms !== undefined && { canParkingHelms }),
        ...(roleUpdate && { roles: roleUpdate }),
      } as any,
      include: { roles: { include: { role: true } } },
    });

    return updated;
  });

  // Preferences-only update
  app.post<{ Params: { id: string }; Body: PreferenceUpdateBody }>('/crew/:id/preferences', async (req, reply) => {
    const { id } = req.params;
    const crew = await prisma.crewMember.findUnique({ where: { id } });
    if (!crew) return reply.code(404).send({ error: 'Crew member not found' });

    const {
      prefFirstHourWeight, prefTaskWeight, prefBlocksizeProdWeight, prefBlocksizeRegWeight,
      prefFirstHour, prefTask, prefBlocksizeProd, prefBlocksizeReg,
      firstHourPreference, taskPreference
    } = req.body;

    const weightFields: [string, number | undefined][] = [
      ['prefFirstHourWeight', prefFirstHourWeight],
      ['prefTaskWeight', prefTaskWeight],
      ['prefBlocksizeProdWeight', prefBlocksizeProdWeight],
      ['prefBlocksizeRegWeight', prefBlocksizeRegWeight],
    ];
    for (const [label, value] of weightFields) {
      if (value !== undefined && (value < 1 || value > 4)) {
        return reply.code(400).send({ error: `${label} must be between 1 and 4` });
      }
    }
    if (prefBlocksizeProd !== undefined && prefBlocksizeProd <= 0) {
      return reply.code(400).send({ error: 'prefBlocksizeProd must be > 0' });
    }
    if (prefBlocksizeReg !== undefined && prefBlocksizeReg <= 0) {
      return reply.code(400).send({ error: 'prefBlocksizeReg must be > 0' });
    }

    const updated = await prisma.crewMember.update({
      where: { id },
      data: {
        ...(prefFirstHourWeight !== undefined && { prefFirstHourWeight }),
        ...(prefTaskWeight !== undefined && { prefTaskWeight }),
        ...(prefBlocksizeProdWeight !== undefined && { prefBlocksizeProdWeight }),
        ...(prefBlocksizeRegWeight !== undefined && { prefBlocksizeRegWeight }),
        ...(prefFirstHour !== undefined && { prefFirstHour: prefFirstHour as any }),
        ...(prefTask !== undefined && { prefTask: prefTask as any }),
        ...(prefBlocksizeProd !== undefined && { prefBlocksizeProd }),
        ...(prefBlocksizeReg !== undefined && { prefBlocksizeReg }),
        ...(firstHourPreference !== undefined && { firstHourPreference: firstHourPreference as any }),
        ...(taskPreference !== undefined && { taskPreference: taskPreference as any }),
      } as any,
      include: { roles: { include: { role: true } } },
    });
    return updated;
  });

  // Add a role to a crew member by role name
  app.post<{ Params: { id: string }; Body: { roleName: string } }>('/crew/:id/add-role', async (req, reply) => {
    const { id } = req.params;
    const { roleName } = req.body;
    if (!roleName) return reply.code(400).send({ error: 'roleName is required' });

    const crew = await prisma.crewMember.findUnique({ where: { id } });
    if (!crew) return reply.code(404).send({ error: 'Crew member not found' });

    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) return reply.code(404).send({ error: 'Role not found' });

    // Guard against duplicates (composite PK on [crewMemberId, roleId])
    const existingLink = await prisma.crewMemberRole.findUnique({
      where: { crewMemberId_roleId: { crewMemberId: id, roleId: role.id } },
    });
    if (existingLink) {
      return reply.code(409).send({ error: 'Crew member already has this role' });
    }

    try {
      await prisma.crewMemberRole.create({ data: { crewMemberId: id, roleId: role.id } });
    } catch (e: any) {
      // Handle potential race-condition duplicate
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: 'Crew member already has this role' });
      }
      throw e;
    }

    // Use HTTP status codes to convey success; no JSON envelope needed
    return reply.code(204).send();
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
