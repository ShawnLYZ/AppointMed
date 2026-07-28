import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';
import { makePool } from '../src/db.js';
import { assertConfigured, config } from '../src/config.js';
import { buildServer } from '../src/server.js';
import type { PostbackPayload } from '../src/postback.js';

// The suite runs against the live hosted project. vitest.config.ts loads
// appointmed_hospital_adapter/.env before this module is imported.
assertConfigured();

export function makeTestContext() {
  const pool = makePool(config.databaseUrl);
  const sent: PostbackPayload[] = [];
  const postback = vi.fn(async (p: PostbackPayload) => {
    sent.push(p);
    return true;
  });
  const app: FastifyInstance = buildServer({ pool, postback });
  return { app, pool, postback, sent, close: async () => { await app.close(); await pool.end(); } };
}
