import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../server.js';
import type { ApiSlot } from '../types.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Marks a rejected query param; caught once in the route handler below and
// turned into the service's { error: "<snake_case_code>" } contract.
class InvalidQueryError extends Error {}

interface ParsedSlotsQuery {
  specialty?: string;
  maxPrice?: number;
  from?: string;
  to?: string;
  limit: number;
}

// Fastify parses a repeated query param (?x=1&x=2) as string[]. Every param
// this route accepts is scalar-or-absent by contract, so an array means the
// caller's input was malformed - reject it rather than silently taking the
// first/last value. (This is also why the query is typed Record<string,
// unknown> below instead of an interface that lies and says "always string".)
function asSingleString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new InvalidQueryError();
  return value;
}

function parseMaxPrice(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new InvalidQueryError();
  return n;
}

function parseDate(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) throw new InvalidQueryError();
  return new Date(ms).toISOString();
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new InvalidQueryError();
  return Math.min(n, MAX_LIMIT);
}

function parseSlotsQuery(query: Record<string, unknown>): ParsedSlotsQuery {
  return {
    specialty: asSingleString(query.specialty),
    maxPrice: parseMaxPrice(asSingleString(query.maxPrice)),
    from: parseDate(asSingleString(query.from)),
    to: parseDate(asSingleString(query.to)),
    limit: parseLimit(asSingleString(query.limit)),
  };
}

export function registerSlotsRoute(app: FastifyInstance, deps: ServerDeps): void {
  app.get<{ Querystring: Record<string, unknown> }>('/slots', async (req, reply) => {
    let query: ParsedSlotsQuery;
    try {
      query = parseSlotsQuery(req.query);
    } catch (err) {
      if (err instanceof InvalidQueryError) {
        return reply.code(400).send({ error: 'invalid_query' });
      }
      throw err;
    }
    const { specialty, maxPrice, from, to, limit } = query;
    const { rows } = await deps.pool.query(
      `select s.id, s.specialist_id, sp.full_name as specialist_name, sp.specialty,
              s.starts_at, s.ends_at, s.price,
              s.hospital_id, h.name as hospital_name, h.address as hospital_address
         from public.slots s
         join public.specialists sp on sp.id = s.specialist_id and sp.is_active
         join public.hospitals h on h.id = s.hospital_id
        where s.hospital_id = $1
          and s.status = 'open'
          and s.starts_at >= coalesce($2::timestamptz, now())
          and s.starts_at > now()
          and s.starts_at <= coalesce($3::timestamptz, now() + interval '7 days')
          and ($4::text is null or sp.specialty ilike $4)
          and ($5::numeric is null or s.price <= $5)
        order by s.starts_at
        limit $6`,
      [req.hospital.id, from ?? null, to ?? null, specialty ?? null, maxPrice ?? null, limit],
    );
    const slots: ApiSlot[] = rows.map((r) => ({
      id: r.id,
      specialistId: r.specialist_id,
      specialistName: r.specialist_name,
      specialty: r.specialty,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at.toISOString(),
      price: Number(r.price),
      hospitalId: r.hospital_id,
      hospitalName: r.hospital_name,
      hospitalAddress: r.hospital_address,
    }));
    return { hospital: { id: req.hospital.id, name: req.hospital.name }, slots };
  });
}
