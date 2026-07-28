import type { FastifyInstance } from 'fastify';
import type { EngineDeps } from '../server.js';
import { config } from '../config.js';
import { applyPostback, type PostbackBody } from '../workflow/nodes/postback.js';

// Hospital adapter → engine. No Supabase bearer token: auth is a shared
// secret header only, so this MUST be registered on the root app, outside
// the bearer-auth scope (see src/server.ts).
export function registerPostbackRoute(app: FastifyInstance, deps: EngineDeps): void {
  app.post<{ Body: PostbackBody }>('/postback', async (req, reply) => {
    if (req.headers['x-postback-secret'] !== config.postbackSecret) {
      return reply.code(401).send({ error: 'invalid_postback_secret' });
    }
    const body = req.body as Partial<PostbackBody> | undefined;
    const ACTIONS = ['confirmed', 'declined', 'rescheduled', 'cancelled'] as const;
    if (typeof body?.externalAppointmentId !== 'string' || body.externalAppointmentId.trim() === ''
      || typeof body?.hospitalId !== 'string' || body.hospitalId.trim() === ''
      || !ACTIONS.includes(body.action as (typeof ACTIONS)[number])
      || (body.action === 'rescheduled'
          && (typeof body.proposedStartsAt !== 'string' || Number.isNaN(Date.parse(body.proposedStartsAt))))) {
      return reply.code(400).send({ error: 'invalid_postback' });
    }
    const result = await applyPostback(deps, body as PostbackBody);
    if ('notFound' in result) return reply.code(404).send({ error: 'unknown_external_id' });
    return result;
  });
}
