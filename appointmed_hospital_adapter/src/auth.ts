import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

export interface HospitalContext {
  id: string;
  name: string;
  apiKeyId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    hospital: HospitalContext;
  }
}

export function makeApiKeyAuth(pool: Pool) {
  return async function apiKeyAuth(req: FastifyRequest, reply: FastifyReply) {
    const key = req.headers['x-api-key'];
    if (typeof key !== 'string' || key.length === 0) {
      return reply.code(401).send({ error: 'missing_api_key' });
    }
    const { rows } = await pool.query(
      `select k.id as api_key_id, h.id as hospital_id, h.name
         from public.hospital_api_keys k
         join public.hospitals h on h.id = k.hospital_id
        where k.api_key = $1 and k.is_active`,
      [key],
    );
    if (rows.length === 0) {
      return reply.code(401).send({ error: 'invalid_api_key' });
    }
    req.hospital = { id: rows[0].hospital_id, name: rows[0].name, apiKeyId: rows[0].api_key_id };
    // Best-effort usage accounting: never fail a request - or crash the
    // process - over the counter. An unhandled rejection would terminate Node 24.
    void pool.query(
      `update public.hospital_api_keys
          set request_count = request_count + 1, last_used_at = now()
        where id = $1`,
      [rows[0].api_key_id],
    ).catch(() => {});
  };
}
