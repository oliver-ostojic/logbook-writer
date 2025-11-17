import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function registerHealthRoutes(app: FastifyInstance) {
  // Health / stub
  app.get('/me', async () => ({ id: '1269090', role: 'Crew Member' }));
}
