import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function registerRunRoutes(app: FastifyInstance) {
  // GET /runs - list all runs with optional filtering
  app.get<{
    Querystring: {
      storeId?: string;
      status?: string;
      engine?: string;
      limit?: string;
      offset?: string;
    };
  }>('/runs', async (req, reply) => {
    try {
      const { storeId, status, engine, limit, offset } = req.query;

      const limitNum = limit ? parseInt(limit) : 50;
      const offsetNum = offset ? parseInt(offset) : 0;

      const where: any = {};
      if (storeId) where.storeId = parseInt(storeId);
      if (status) where.status = status;
      if (engine) where.engine = engine;

      const [runs, total] = await Promise.all([
        prisma.run.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limitNum,
          skip: offsetNum,
          include: {
            Store: {
              select: { id: true, name: true },
            },
            Logbook: {
              select: { id: true, status: true },
            },
          },
        }),
        prisma.run.count({ where }),
      ]);

      return {
        runs,
        total,
        limit: limitNum,
        offset: offsetNum,
      };
    } catch (error: any) {
      console.error('Error fetching runs:', error);
      return reply.status(500).send({ error: error.message || 'Failed to fetch runs' });
    }
  });

  // GET /runs/:id - get a single run by ID
  app.get<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    try {
      const runId = req.params.id;

      const run = await prisma.run.findUnique({
        where: { id: runId },
        include: {
          Store: {
            select: { id: true, name: true },
          },
          Logbook: {
            select: { id: true, status: true, generatedAt: true },
          },
        },
      });

      if (!run) {
        return reply.status(404).send({ error: 'Run not found' });
      }

      return run;
    } catch (error: any) {
      console.error('Error fetching run:', error);
      return reply.status(500).send({ error: error.message || 'Failed to fetch run' });
    }
  });

  // DELETE /runs/:id - delete a run
  app.delete<{ Params: { id: string } }>('/runs/:id', async (req, reply) => {
    try {
      const runId = req.params.id;

      const existing = await prisma.run.findUnique({
        where: { id: runId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Run not found' });
      }

      await prisma.run.delete({
        where: { id: runId },
      });

      return { ok: true, deleted: runId };
    } catch (error: any) {
      console.error('Error deleting run:', error);
      return reply.status(500).send({ error: error.message || 'Failed to delete run' });
    }
  });
}
