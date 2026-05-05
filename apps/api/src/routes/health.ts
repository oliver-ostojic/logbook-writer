import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/me', async () => ({ id: '1269090', role: 'Crew Member' }));
}
