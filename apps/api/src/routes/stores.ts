import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { rbacMiddleware } from '../middleware/rbac';

const prisma = new PrismaClient();

type CreateStoreBody = {
  id?: number;
  name: string;
  timezone?: string;
  openMinutesFromMidnight?: number;
  closeMinutesFromMidnight?: number;
  companyId: number;
};

type UpdateStoreBody = {
  name?: string;
  timezone?: string;
  openMinutesFromMidnight?: number;
  closeMinutesFromMidnight?: number;
  companyId?: number;
};

export function registerStoreRoutes(app: FastifyInstance) {
  // GET /stores - list all stores
  app.get('/stores', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    try {
      const stores = await prisma.store.findMany({
        orderBy: { name: 'asc' },
        include: {
          Company: {
            select: { id: true, name: true },
          },
        },
      });

      return stores;
    } catch (error: any) {
      console.error('Error fetching stores:', error);
      return reply.status(500).send({ error: error.message || 'Failed to fetch stores' });
    }
  });

  // GET /stores/:id - Get a store by ID
  app.get<{ Params: { id: string } }>('/stores/:id', { preHandler: rbacMiddleware({ allowedRoles: ['MATE', 'CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    try {
      const storeId = parseInt(req.params.id);

      if (isNaN(storeId)) {
        return reply.status(400).send({ error: 'Invalid store ID' });
      }

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

  // POST /stores - create a new store
  app.post<{ Body: CreateStoreBody }>('/stores', { preHandler: rbacMiddleware({ allowedRoles: ['CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const { id, name, timezone, openMinutesFromMidnight, closeMinutesFromMidnight, companyId } = req.body;

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Name is required' });
    }

    if (!companyId) {
      return reply.status(400).send({ error: 'Company ID is required' });
    }

    try {
      // Verify company exists
      const company = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) {
        return reply.status(404).send({ error: 'Company not found' });
      }

      // Auto-generate ID if not provided
      let storeId = id;
      if (storeId === undefined || storeId === null) {
        // Get the max store ID and increment
        const maxStore = await prisma.store.findFirst({
          orderBy: { id: 'desc' },
          select: { id: true },
        });
        storeId = maxStore ? maxStore.id + 1 : 1;
      }

      const store = await prisma.store.create({
        data: {
          id: storeId,
          name: name.trim(),
          companyId,
          timezone: timezone || 'EST',
          openMinutesFromMidnight: openMinutesFromMidnight ?? 480,
          closeMinutesFromMidnight: closeMinutesFromMidnight ?? 1260,
        },
        include: {
          Company: true,
        },
      });

      return store;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return reply.status(409).send({ error: 'Store with this ID already exists' });
      }
      console.error('Error creating store:', error);
      return reply.status(500).send({ error: error.message || 'Failed to create store' });
    }
  });

  // PATCH /stores/:id - update a store
  app.patch<{ Params: { id: string }; Body: UpdateStoreBody }>('/stores/:id', { preHandler: rbacMiddleware({ allowedRoles: ['CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const storeId = parseInt(req.params.id);
    const { name, timezone, openMinutesFromMidnight, closeMinutesFromMidnight, companyId } = req.body;

    if (isNaN(storeId)) {
      return reply.status(400).send({ error: 'Invalid store ID' });
    }

    try {
      const existing = await prisma.store.findUnique({
        where: { id: storeId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Store not found' });
      }

      // Build update data with only provided fields
      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (timezone !== undefined) updateData.timezone = timezone;
      if (openMinutesFromMidnight !== undefined) updateData.openMinutesFromMidnight = openMinutesFromMidnight;
      if (closeMinutesFromMidnight !== undefined) updateData.closeMinutesFromMidnight = closeMinutesFromMidnight;
      if (companyId !== undefined) {
        // Verify company exists
        const company = await prisma.company.findUnique({
          where: { id: companyId },
        });
        if (!company) {
          return reply.status(404).send({ error: 'Company not found' });
        }
        updateData.companyId = companyId;
      }

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({ error: 'No fields to update' });
      }

      const updated = await prisma.store.update({
        where: { id: storeId },
        data: updateData,
        include: {
          Company: true,
        },
      });

      return updated;
    } catch (error: any) {
      console.error('Error updating store:', error);
      return reply.status(500).send({ error: error.message || 'Failed to update store' });
    }
  });

  // DELETE /stores/:id - delete a store
  app.delete<{ Params: { id: string } }>('/stores/:id', { preHandler: rbacMiddleware({ allowedRoles: ['CAPTAIN', 'ADMIN'] }) }, async (req, reply) => {
    const storeId = parseInt(req.params.id);

    if (isNaN(storeId)) {
      return reply.status(400).send({ error: 'Invalid store ID' });
    }

    try {
      const existing = await prisma.store.findUnique({
        where: { id: storeId },
        include: {
          Crew: { select: { id: true } },
          Role: { select: { id: true } },
          Logbook: { select: { id: true } },
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Store not found' });
      }

      // Warn if store has associated data (but still allow deletion due to cascade)
      const warnings = [];
      if (existing.Crew.length > 0) {
        warnings.push(`${existing.Crew.length} crew member(s)`);
      }
      if (existing.Role.length > 0) {
        warnings.push(`${existing.Role.length} role(s)`);
      }
      if (existing.Logbook.length > 0) {
        warnings.push(`${existing.Logbook.length} logbook(s)`);
      }

      // Delete store (cascading deletes will handle related records)
      await prisma.store.delete({
        where: { id: storeId },
      });

      return {
        ok: true,
        deleted: storeId,
        ...(warnings.length > 0 && { warnings: `Deleted store with ${warnings.join(', ')}` }),
      };
    } catch (error: any) {
      console.error('Error deleting store:', error);
      return reply.status(500).send({ error: error.message || 'Failed to delete store' });
    }
  });
}
