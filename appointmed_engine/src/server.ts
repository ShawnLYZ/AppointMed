import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import type { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OllamaClient } from './ollama/client.js';
import type { AdapterClient } from './tools/adapter.js';
import { makeBearerAuth } from './auth.js';
import { registerConsultRoutes } from './routes/consult.js';
import { registerPostbackRoute } from './routes/postback.js';
import { registerRespondRoute } from './routes/respond.js';
import { registerPortalPublicRoutes, registerPortalManagerRoutes } from './routes/portal.js';

export interface EngineDeps {
  pool: Pool;
  supabase: SupabaseClient;
  ollama: OllamaClient;
  adapter: AdapterClient;
  extractPdfText: (buf: Buffer) => Promise<string>;
}

export function buildServer(deps: EngineDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });

  // The Phase 5 portal runs in the browser and calls this engine cross-origin -
  // must be registered at root, before the auth scope below, so the CORS hook
  // flows down into it and preflight is answered before auth can reject it.
  app.register(cors, {
    origin: true,                                               // reflect the requesting origin (demo posture)
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'authorization', 'x-api-key'],
  });

  app.get('/health', async () => ({ status: 'ok', service: 'appointmed-engine' }));

  // Hospital adapter → engine postback: secret-header auth only (no Supabase
  // token) - MUST stay on the root app, OUTSIDE the bearer-auth scope below.
  registerPostbackRoute(app, deps);

  // Prospective hospital has no account yet - subscribe MUST stay on the
  // root app too, unauthenticated.
  registerPortalPublicRoutes(app, deps);

  // every authenticated route MUST be registered inside this scope
  app.register(async (authed) => {
    authed.addHook('preHandler', makeBearerAuth(deps.supabase));
    registerConsultRoutes(authed, deps);
    registerRespondRoute(authed, deps);
    registerPortalManagerRoutes(authed, deps);
  });

  // Any uncaught route error (DB fault, unexpected LLM/adapter throw, etc.)
  // must still resolve to a clean, non-leaking response - never Fastify's
  // default 500 shape, which echoes `message`/stack back to the caller.
  // Registered on the root app: Fastify has child scopes inherit the parent's
  // error handler unless they set their own, so this single registration also
  // covers the `authed` encapsulated scope above. Mirrors the Phase-2
  // adapter's { error: 'internal_error' } contract; unlike that handler this
  // one does NOT console.error - logger:false makes req.log an inert no-op,
  // and no other paths in this app write to the console, so keep it that way.
  app.setErrorHandler((err, req, reply) => {
    req.log?.error?.(err);
    reply.code(500).send({ error: 'internal_error' });
  });

  return app;
}
