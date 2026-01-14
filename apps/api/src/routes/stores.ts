import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function registerStoreRoutes(app: FastifyInstance) {
  // GET /stores/:id - Get a store by ID
  app.get<{ Params: { id: string } }>('/stores/:id', async (req, reply) => {
    try {
      const storeId = parseInt(req.params.id);

      const store = await prisma.store.findUnique({
        where: { id: storeId },
        include: {
          Company: true,
        },
      });

      if (!store) {
        return reply.status(404).send({ error: 'Store not found' });
      }

      return store;
    } catch (error: any) {
      console.error('Error fetching store:', error);
      return reply.status(500).send({ error: error.message || 'Failed to fetch store' });
    }
  });
}
