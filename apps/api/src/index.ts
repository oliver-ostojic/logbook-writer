import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerHealthRoutes } from './routes/health';
import { registerCrewRoutes } from './routes/crew';
import { registerRoleRoutes } from './routes/roles';
import { registerWizardRoutes } from './routes/wizard';
import { registerScheduleRoutes } from './routes/schedule';
import { registerSolverRoutes } from './routes/solver';
import { registerTuningRoutes } from './routes/tuning';

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  // Register all route modules
  registerHealthRoutes(app);
  registerCrewRoutes(app);
  registerRoleRoutes(app);
  registerWizardRoutes(app);
  registerScheduleRoutes(app);
  registerSolverRoutes(app);
  registerTuningRoutes(app);

  return app;
}

// Bootstrap if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildServer().then(app => {
    const port = Number(process.env.PORT ?? 4000);
    app.listen({ port, host: '0.0.0.0' }).catch(err => {
      app.log.error(err);
      process.exit(1);
    });
  });
}