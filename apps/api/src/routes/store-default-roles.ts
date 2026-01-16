import { FastifyInstance } from 'fastify';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type CreateStoreDefaultRoleBody = {
  roleId: number;
};

export function registerStoreDefaultRoleRoutes(app: FastifyInstance) {
  // GET /stores/:storeId/default-roles - List default roles for a store
  app.get<{ Params: { storeId: string } }>(
    '/stores/:storeId/default-roles',
    async (req, reply) => {
      const storeId = parseInt(req.params.storeId);

      if (isNaN(storeId)) {
        return reply.code(400).send({ error: 'Invalid store ID' });
      }

      const defaultRoles = await prisma.storeDefaultRole.findMany({
        where: { storeId },
        include: {
          Role: {
            select: {
              id: true,
              code: true,
              displayName: true,
              storeId: true,
            },
          },
        },
        orderBy: { Role: { displayName: 'asc' } },
      });

      return reply.send(defaultRoles);
    }
  );

  // POST /stores/:storeId/default-roles - Add a default role to a store
  app.post<{ Params: { storeId: string }; Body: CreateStoreDefaultRoleBody }>(
    '/stores/:storeId/default-roles',
    async (req, reply) => {
      const storeId = parseInt(req.params.storeId);
      const { roleId } = req.body;

      if (isNaN(storeId)) {
        return reply.code(400).send({ error: 'Invalid store ID' });
      }

      if (!roleId) {
        return reply.code(400).send({ error: 'roleId is required' });
      }

      // Verify store exists
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) {
        return reply.code(400).send({ error: `Store ${storeId} not found` });
      }

      // Verify role exists
      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role) {
        return reply.code(400).send({ error: `Role ${roleId} not found` });
      }

      try {
        const defaultRole = await prisma.storeDefaultRole.create({
          data: { storeId, roleId },
          include: {
            Role: {
              select: {
                id: true,
                code: true,
                displayName: true,
                storeId: true,
              },
            },
          },
        });

        return reply.code(201).send(defaultRole);
      } catch (error: any) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return reply.code(409).send({
            error: 'This role is already a default role for this store',
          });
        }
        throw error;
      }
    }
  );

  // DELETE /stores/:storeId/default-roles/:roleId - Remove a default role from a store
  app.delete<{ Params: { storeId: string; roleId: string } }>(
    '/stores/:storeId/default-roles/:roleId',
    async (req, reply) => {
      const storeId = parseInt(req.params.storeId);
      const roleId = parseInt(req.params.roleId);

      if (isNaN(storeId) || isNaN(roleId)) {
        return reply.code(400).send({ error: 'Invalid store or role ID' });
      }

      try {
        await prisma.storeDefaultRole.delete({
          where: {
            storeId_roleId: { storeId, roleId },
          },
        });

        return reply.code(204).send();
      } catch (error: any) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          return reply.code(404).send({ error: 'Default role not found' });
        }
        throw error;
      }
    }
  );
}
