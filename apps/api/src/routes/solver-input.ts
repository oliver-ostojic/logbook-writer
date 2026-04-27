import { FastifyInstance } from 'fastify';
import { buildSolverInputV2 } from '../solver2/builder';

/**
 * GET /solver/input/:storeId/:date
 * 
 * Returns complete SolverInput for a given store and date.
 * Fetches:
 * - Store metadata (slot size, hours, break policy)
 * - All roles with metadata (minSlots, maxSlots, blockSize, etc.)
 * - All crew with their shifts for the date
 * - All constraints (hourly, window, daily)
 * - All preferences (role preferences + crew opt-ins)
 * 
 * The output can be directly passed to the Python solver.
 */
export async function solverInputRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { storeId: string; date: string };
    Querystring: { lookbackDays?: string };
  }>('/solver/input/:storeId/:date', async (request, reply) => {
    const storeId = parseInt(request.params.storeId, 10);
    const lookbackDays = parseInt(request.query.lookbackDays || '7', 10);

    if (Number.isNaN(storeId)) {
      return reply.code(400).send({ error: 'Invalid storeId' });
    }

    try {
      const solverInput = await buildSolverInputV2({
        storeId,
        date: request.params.date,
        lookbackDays,
      });

      return reply.send({
        success: true,
        data: solverInput,
        metadata: {
          storeId,
          date: request.params.date,
          crewCount: solverInput.crew.length,
          roleCount: solverInput.roles.length,
          constraintCounts: {
            coverageWindows: solverInput.coverageWindows.length,
            crewQuotas: solverInput.crewQuotas.length,
            roleRules: solverInput.roleRules.length,
          },
        },
      });
    } catch (error: any) {
      fastify.log.error(error);
      const message = error?.message ?? 'Failed to build solver input';
      const statusCode = message.includes('not found') ? 404 : 500;
      return reply.code(statusCode).send({
        error: 'Failed to build solver input',
        message,
      });
    }
  });
}
