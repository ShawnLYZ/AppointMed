import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Pool } from 'pg';
import { makeApiKeyAuth } from './auth.js';
import type { PostbackSender } from './postback.js';
import { registerSpecialistsRoute } from './routes/specialists.js';
import { registerSlotsRoute } from './routes/slots.js';
import { registerAppointmentRoutes } from './routes/appointments.js';

export interface ServerDeps {
  pool: Pool;
  postback: PostbackSender;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  // The Phase 5 portal runs in the browser and calls this adapter cross-origin -
  // must be registered at root, before the auth scope below, so the CORS hook
  // flows down into it and preflight is answered before auth can reject it.
  app.register(cors, {
    origin: true,                                               // reflect the requesting origin (demo posture)
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'authorization', 'x-api-key'],
  });

  app.get('/health', async () => ({ status: 'ok', service: 'appointmed-hospital-adapter' }));

  app.register(async (authed) => {
    authed.addHook('preHandler', makeApiKeyAuth(deps.pool));
    registerSpecialistsRoute(authed, deps);
    registerSlotsRoute(authed, deps);
    registerAppointmentRoutes(authed, deps);
  });

  // Any unhandled route error must still honor the service's error contract:
  // { "error": "<snake_case_code>" }. Never leak driver/stack text to callers.
  app.setErrorHandler((err, _req, reply) => {
    console.error('unhandled route error:', err);
    reply.code(500).send({ error: 'internal_error' });
  });

  return app;
}
