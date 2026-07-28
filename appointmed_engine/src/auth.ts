import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; email: string };
  }
}

export function makeBearerAuth(supabase: SupabaseClient) {
  return async function bearerAuth(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });
    const { data, error } = await supabase.auth.getUser(header.slice(7));
    if (error || !data.user) return reply.code(401).send({ error: 'invalid_token' });
    req.user = { id: data.user.id, email: data.user.email ?? '' };
  };
}
