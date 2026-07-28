import type { FastifyInstance } from 'fastify';
import type { ServerDeps } from '../server.js';
import type { ApiSpecialist } from '../types.js';

export function registerSpecialistsRoute(app: FastifyInstance, deps: ServerDeps): void {
  app.get('/specialists', async (req) => {
    const { rows } = await deps.pool.query(
      `select id, full_name, specialty, price, is_active
         from public.specialists
        where hospital_id = $1 and is_active
        order by full_name`,
      [req.hospital.id],
    );
    const specialists: ApiSpecialist[] = rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      specialty: r.specialty,
      price: Number(r.price),
      isActive: r.is_active,
    }));
    return { hospital: { id: req.hospital.id, name: req.hospital.name }, specialists };
  });
}
