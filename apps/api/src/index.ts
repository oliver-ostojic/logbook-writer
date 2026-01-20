import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerCrewRoutes } from './routes/crew';
import { registerRoleRoutes } from './routes/roles';
import { registerRoleRuleRoutes } from './routes/role-rules';
import { registerCompanyRoutes } from './routes/companies';
import { registerStoreRoutes } from './routes/stores';
import { registerRunRoutes } from './routes/runs';
import { registerScheduleRoutes, registerLogbookRoutes } from './routes/schedule';
import { registerSolverRoutes } from './routes/solver';
import { registerSolverV2Routes } from './routes/solver2';
import { registerTuningRoutes } from './routes/tuning';
import { solverInputRoutes } from './routes/solver-input';
import { registerShiftRoutes } from './routes/shifts';
import { registerConstraintRoutes } from './routes/constraints';
import { registerDashboardRoutes } from './routes/dashboard';
import { registerStoreDefaultRoleRoutes } from './routes/store-default-roles';
import { AUTH_CONFIG } from './config/auth.config';

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true, credentials: true });

  // Register JWT plugin
  await app.register(fastifyJwt, {
    secret: AUTH_CONFIG.jwt.secret,
  });

  // Register cookie plugin
  await app.register(fastifyCookie);

  // Register all route modules
  registerAuthRoutes(app);
  registerHealthRoutes(app);
  registerCrewRoutes(app);
  registerRoleRoutes(app);
  registerRoleRuleRoutes(app);
  registerCompanyRoutes(app);
  registerStoreRoutes(app);
  registerStoreDefaultRoleRoutes(app);
  registerRunRoutes(app);
  registerScheduleRoutes(app);
  registerLogbookRoutes(app);
  registerSolverRoutes(app);
  registerSolverV2Routes(app);
  registerTuningRoutes(app);
  await app.register(solverInputRoutes);
  registerShiftRoutes(app);
  registerConstraintRoutes(app);
  registerDashboardRoutes(app);

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