import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type CreateCompanyBody = {
  name: string;
};

type UpdateCompanyBody = {
  name?: string;
};

export function registerCompanyRoutes(app: FastifyInstance) {
  // GET /companies - list all companies
  app.get('/companies', async (req, reply) => {
    try {
      const companies = await prisma.company.findMany({
        orderBy: { name: 'asc' },
        include: {
          Store: {
            select: { id: true, name: true },
          },
        },
      });

      // Transform to include store count
      const companiesWithCounts = companies.map(company => ({
        id: company.id,
        name: company.name,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        storeCount: company.Store.length,
        stores: company.Store,
      }));

      return companiesWithCounts;
    } catch (error: any) {
      console.error('Error fetching companies:', error);
      return reply.status(500).send({ error: error.message || 'Failed to fetch companies' });
    }
  });

  // GET /companies/:id - get a single company with stores
  app.get<{ Params: { id: string } }>('/companies/:id', async (req, reply) => {
    try {
      const companyId = parseInt(req.params.id);

      if (isNaN(companyId)) {
        return reply.status(400).send({ error: 'Invalid company ID' });
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: {
          Store: {
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          },
        },
      });

      if (!company) {
        return reply.status(404).send({ error: 'Company not found' });
      }

      // Transform to match frontend expectations
      return {
        id: company.id,
        name: company.name,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        stores: company.Store,
      };
    } catch (error: any) {
      console.error('Error fetching company:', error);
      return reply.status(500).send({ error: error.message || 'Failed to fetch company' });
    }
  });

  // POST /companies - create a new company
  app.post<{ Body: CreateCompanyBody }>('/companies', async (req, reply) => {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Name is required' });
    }

    try {
      const company = await prisma.company.create({
        data: {
          name: name.trim(),
        },
        include: {
          Store: {
            select: { id: true, name: true },
          },
        },
      });

      return {
        id: company.id,
        name: company.name,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
        stores: company.Store,
      };
    } catch (error: any) {
      console.error('Error creating company:', error);
      return reply.status(500).send({ error: error.message || 'Failed to create company' });
    }
  });

  // PATCH /companies/:id - update a company
  app.patch<{ Params: { id: string }; Body: UpdateCompanyBody }>('/companies/:id', async (req, reply) => {
    const companyId = parseInt(req.params.id);
    const { name } = req.body;

    if (isNaN(companyId)) {
      return reply.status(400).send({ error: 'Invalid company ID' });
    }

    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'Name is required' });
    }

    try {
      const existing = await prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Company not found' });
      }

      const updated = await prisma.company.update({
        where: { id: companyId },
        data: { name: name.trim() },
        include: {
          Store: {
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          },
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        stores: updated.Store,
      };
    } catch (error: any) {
      console.error('Error updating company:', error);
      return reply.status(500).send({ error: error.message || 'Failed to update company' });
    }
  });

  // DELETE /companies/:id - delete a company
  app.delete<{ Params: { id: string } }>('/companies/:id', async (req, reply) => {
    const companyId = parseInt(req.params.id);

    if (isNaN(companyId)) {
      return reply.status(400).send({ error: 'Invalid company ID' });
    }

    try {
      const existing = await prisma.company.findUnique({
        where: { id: companyId },
        include: {
          Store: { select: { id: true } },
        },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Company not found' });
      }

      // Prevent deletion if company has stores
      if (existing.Store.length > 0) {
        return reply.status(400).send({
          error: `Cannot delete company with ${existing.Store.length} store(s). Please delete or reassign stores first.`,
        });
      }

      await prisma.company.delete({
        where: { id: companyId },
      });

      return { ok: true, deleted: companyId };
    } catch (error: any) {
      console.error('Error deleting company:', error);
      return reply.status(500).send({ error: error.message || 'Failed to delete company' });
    }
  });
}
