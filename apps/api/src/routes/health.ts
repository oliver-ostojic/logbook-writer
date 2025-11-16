import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function registerHealthRoutes(app: FastifyInstance) {
  // Health / stub
  app.get('/me', async () => ({ id: '1269090', role: 'Crew Member' }));

  // Utility: list roles (id, name) to help find DEMO role id for manual testing
  app.get('/roles', async () => {
    const roles = await prisma.role.findMany({ select: { id: true, name: true } });
    return roles;
  });
}
