import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { EngineDeps } from '../server.js';

const PLANS = {
  starter: { price: 500, max: 5 }, growth: { price: 1200, max: 20 }, enterprise: { price: 2500, max: null },
} as const;

const STARTER_SPECIALISTS = [
  ['Dr. Aina Rahman', 'General Practice', 80], ['Dr. Daniel Teo', 'Cardiology', 180],
  ['Dr. Farah Lim', 'Dermatology', 120],
] as const;

function newApiKey(): string {
  return `amk_live_${randomBytes(12).toString('hex')}`;
}

// Compensation helpers for /portal/subscribe: each is best-effort (swallows
// its own failure) so one compensation step failing can never block the
// other, and never masks the error/response that triggered compensation.
async function deleteHospitalQuietly(deps: EngineDeps, hospitalId: string): Promise<void> {
  try { await deps.pool.query('delete from public.hospitals where id = $1', [hospitalId]); } catch { /* best-effort compensation */ }
}

async function deleteUserQuietly(deps: EngineDeps, userId: string): Promise<void> {
  try { await deps.supabase.auth.admin.deleteUser(userId); } catch { /* best-effort compensation */ }
}

export function registerPortalPublicRoutes(app: FastifyInstance, deps: EngineDeps): void {
  app.post('/portal/subscribe', async (req, reply) => {
    const body = req.body as {
      hospital: { name: string; address: string; workingHours?: object };
      plan: keyof typeof PLANS;
      manager: { email: string; password: string; fullName: string; phone?: string };
      billing: { cardholder: string; cardLast4: string };
    };
    if (!body?.hospital?.name || !PLANS[body.plan] || !body?.manager?.email || !body?.manager?.password) {
      return reply.code(400).send({ error: 'invalid_subscription' });
    }

    const hospitalId = randomUUID();

    // Hospital row FIRST, its own statement (auto-committed before we go any
    // further) - the signup trigger below inserts a profiles row whose
    // hospital_id FK + manager_requires_hospital check both need this row to
    // already exist. Creating the auth user first (the brief's original
    // order) fails that FK, since the hospital wouldn't exist yet.
    await deps.pool.query(
      `insert into public.hospitals (id, name, address, working_hours) values ($1,$2,$3,$4)`,
      [hospitalId, body.hospital.name, body.hospital.address ?? '', JSON.stringify(body.hospital.workingHours ?? {})]);

    // Auth user next - the on_auth_user_created trigger now inserts the
    // profile pointing at a hospital_id that already exists.
    let createdUserId: string;
    try {
      const { data: created, error } = await deps.supabase.auth.admin.createUser({
        email: body.manager.email, password: body.manager.password, email_confirm: true,
        app_metadata: { role: 'hospital_manager', hospital_id: hospitalId },
        user_metadata: { full_name: body.manager.fullName, phone: body.manager.phone ?? '' },
      });
      if (error) {
        // Compensate: undo the hospital row created above - nothing else
        // exists yet. Best-effort: a failed delete here must never mask the
        // intended 409/500 below.
        await deleteHospitalQuietly(deps, hospitalId);
        const dup = /already|registered|exists/i.test(error.message);
        return reply.code(dup ? 409 : 500).send({ error: dup ? 'email_in_use' : 'auth_failed' });
      }
      createdUserId = created.user.id;
    } catch {
      // createUser THREW (e.g. a network rejection) instead of returning
      // {error} - same hospital-row compensation as the non-dup branch
      // above, and kept consistent with it: 500 auth_failed.
      await deleteHospitalQuietly(deps, hospitalId);
      return reply.code(500).send({ error: 'auth_failed' });
    }

    const apiKey = newApiKey();
    const client = await deps.pool.connect();
    try {
      await client.query('begin');
      const plan = PLANS[body.plan];
      await client.query(
        `insert into public.subscriptions (hospital_id, plan, status, monthly_price_rm, max_specialists, renews_at)
         values ($1,$2,'active',$3,$4, now() + interval '1 month')`,
        [hospitalId, body.plan, plan.price, plan.max]);
      await client.query(
        `insert into public.hospital_api_keys (hospital_id, api_key, label) values ($1,$2,'Primary key')`,
        [hospitalId, apiKey]);
      for (const [name, specialty, price] of STARTER_SPECIALISTS) {
        await client.query(
          `with sp as (
             insert into public.specialists (hospital_id, full_name, specialty, price)
             values ($1,$2,$3,$4) returning id, hospital_id, price)
           insert into public.slots (hospital_id, specialist_id, starts_at, ends_at, price)
           select sp.hospital_id, sp.id,
                  ((current_date + d.day)::timestamp + make_interval(hours => h.hour)) at time zone 'Asia/Kuala_Lumpur',
                  ((current_date + d.day)::timestamp + make_interval(hours => h.hour, mins => 30)) at time zone 'Asia/Kuala_Lumpur',
                  sp.price
             from sp
            cross join generate_series(1, 7) as d(day)
            cross join unnest(array[9,10,11,14,15,16]) as h(hour)
            where extract(dow from current_date + d.day) <> 0`,
          [hospitalId, name, specialty, price]);
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      // Compensate BOTH the auth user and the hospital row - nothing may be
      // left pointing at a hospital that failed to get its inventory. Each
      // step is independently best-effort so one failing can never block the
      // other, and the ORIGINAL err is always what gets rethrown below.
      await deleteUserQuietly(deps, createdUserId);
      await deleteHospitalQuietly(deps, hospitalId);
      throw err;
    } finally {
      client.release();
    }

    return reply.code(201).send({
      hospitalId, apiKey, plan: body.plan,
      monthlyPriceRm: PLANS[body.plan].price, managerEmail: body.manager.email,
    });
  });
}

/** 403 manager_only when the caller isn't a hospital_manager; otherwise their hospital_id (tenancy scope). */
async function requireManagerHospitalId(deps: EngineDeps, userId: string): Promise<string | null> {
  const { rows } = await deps.pool.query(
    'select role, hospital_id from public.profiles where id = $1', [userId]);
  if (rows.length === 0 || rows[0].role !== 'hospital_manager') return null;
  return rows[0].hospital_id as string;
}

export function registerPortalManagerRoutes(app: FastifyInstance, deps: EngineDeps): void {
  app.post<{ Params: { id: string } }>('/portal/specialists/:id/toggle', async (req, reply) => {
    const hospitalId = await requireManagerHospitalId(deps, req.user.id);
    if (!hospitalId) return reply.code(403).send({ error: 'manager_only' });
    // Tenancy lives in the SQL, not app code - a foreign (or absent) specialist
    // never surfaces as anything but 404, same pattern as /appointments/:id/respond.
    const { rows } = await deps.pool.query(
      `update public.specialists set is_active = not is_active where id = $1 and hospital_id = $2
       returning id, is_active`,
      [req.params.id, hospitalId]);
    if (rows.length === 0) return reply.code(404).send({ error: 'specialist_not_found' });
    return { id: rows[0].id, isActive: rows[0].is_active };
  });

  app.post('/portal/api-key/regenerate', async (req, reply) => {
    const hospitalId = await requireManagerHospitalId(deps, req.user.id);
    if (!hospitalId) return reply.code(403).send({ error: 'manager_only' });
    const apiKey = newApiKey();
    // Deactivating the old key(s) and inserting the new one must commit
    // together - a failure between the two must never leave the hospital
    // with zero active keys.
    const client = await deps.pool.connect();
    try {
      await client.query('begin');
      await client.query(`update public.hospital_api_keys set is_active = false where hospital_id = $1`, [hospitalId]);
      await client.query(
        `insert into public.hospital_api_keys (hospital_id, api_key, label) values ($1,$2,'Regenerated key')`,
        [hospitalId, apiKey]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    return { apiKey };
  });

  app.post('/portal/verification-docs', async (req, reply) => {
    const hospitalId = await requireManagerHospitalId(deps, req.user.id);
    if (!hospitalId) return reply.code(403).send({ error: 'manager_only' });
    const uploaded: string[] = [];
    for await (const file of req.files()) {
      const buf = await file.toBuffer();
      const path = `${hospitalId}/${Date.now()}-${file.filename}`;
      const { error } = await deps.supabase.storage.from('verification-docs')
        .upload(path, buf, { contentType: file.mimetype, upsert: true });
      if (error) throw new Error(`storage upload failed: ${error.message}`);
      uploaded.push(file.filename);
    }
    return { uploaded };
  });
}
