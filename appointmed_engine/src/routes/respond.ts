import type { FastifyInstance } from 'fastify';
import type { EngineDeps } from '../server.js';
import { getRun, saveRun, logStep } from '../workflow/runs.js';
import { matchAndPresent } from '../workflow/nodes/match.js';

// Cancelling at the hospital is a best-effort network call: the adapter may
// be unreachable, but the patient's own cancellation must still succeed
// locally. Shared by both the `cancel` action and the `re_match` branch's
// reschedule_proposed sub-case so the external_appointment_id guard and
// error handling live in exactly one place.
async function cancelAtHospital(deps: EngineDeps, appt: { id: string; hospital_id: string; external_appointment_id: string; run_id: string | null }): Promise<void> {
  if (!appt.external_appointment_id) return;
  const key = await deps.pool.query(
    'select api_key from public.hospital_api_keys where hospital_id = $1 and is_active order by created_at desc limit 1',
    [appt.hospital_id]);
  if (key.rows.length === 0) return;
  try {
    await deps.adapter.cancel(key.rows[0].api_key, appt.external_appointment_id);
    if (appt.run_id) {
      await logStep(deps.pool, appt.run_id, 'postback', 'tool_call',
        { tool: 'adapter.cancel', externalAppointmentId: appt.external_appointment_id }, { ok: true });
    }
  } catch (err) {
    // Best-effort: the hospital may be unreachable, but the patient's cancellation
    // must still succeed locally. Record it and move on.
    if (appt.run_id) {
      await logStep(deps.pool, appt.run_id, 'postback', 'error',
        { tool: 'adapter.cancel', externalAppointmentId: appt.external_appointment_id }, { message: String(err) });
    }
  }
}

export function registerRespondRoute(app: FastifyInstance, deps: EngineDeps): void {
  app.post<{ Params: { id: string }; Body: { action: 'accept_reschedule' | 're_match' | 'cancel' } }>(
    '/appointments/:id/respond', async (req, reply) => {
      // Owner-only: a foreign appointment must 404, never surface another
      // user's row - the user_id filter lives in the SQL, not app code.
      const { rows } = await deps.pool.query(
        'select * from public.appointments where id = $1 and user_id = $2', [req.params.id, req.user.id]);
      if (rows.length === 0) return reply.code(404).send({ error: 'appointment_not_found' });
      const appt = rows[0];

      const action = req.body?.action;
      if (action !== 'accept_reschedule' && action !== 're_match' && action !== 'cancel') {
        return reply.code(400).send({ error: 'invalid_action' });
      }

      if (req.body.action === 'accept_reschedule') {
        if (appt.status !== 'reschedule_proposed') return reply.code(409).send({ error: 'not_reschedule_proposed' });
        // Appointments UPDATE + its notification are related writes that must
        // commit together (Phase-3 atomicity policy) - no network call on
        // this path, so both fit in one transaction.
        const client = await deps.pool.connect();
        try {
          await client.query('begin');
          await client.query(
            `update public.appointments set starts_at = proposed_starts_at, proposed_starts_at = null,
                    status = 'confirmed', status_source = 'appointmed' where id = $1`, [appt.id]);
          await client.query(
            `insert into public.notifications (user_id, type, title, body, data) values ($1, $2, $3, $4, $5)`,
            [appt.user_id, 'booking_update', 'Appointment confirmed 🎉',
             `New time accepted for ${appt.specialist_name} at ${appt.hospital_name}.`,
             JSON.stringify({ appointmentId: appt.id })]);
          await client.query('commit');
        } catch (err) {
          await client.query('rollback');
          throw err;
        } finally {
          client.release();
        }
        if (appt.run_id) {
          const run = await getRun(deps.pool, appt.run_id);
          if (run) {
            run.node = 'done'; run.status = 'completed';
            await logStep(deps.pool, run.id, 'postback', 'transition',
              { reEnteredVia: 'respond.accept_reschedule' }, { to: 'done', appointmentId: appt.id });
            await saveRun(deps.pool, run);
          }
        }
        return { ok: true, appointmentId: appt.id, status: 'confirmed' };
      }

      if (req.body.action === 'cancel') {
        if (!['pending', 'confirmed', 'reschedule_proposed'].includes(appt.status)) {
          return reply.code(409).send({ error: 'not_cancellable' });
        }
        // adapter.cancel is a network call - it must complete BEFORE the
        // transaction opens below (never hold a DB txn across a network call).
        await cancelAtHospital(deps, appt);
        const client = await deps.pool.connect();
        try {
          await client.query('begin');
          await client.query(
            `update public.appointments set status = 'cancelled', status_source = 'appointmed' where id = $1`, [appt.id]);
          await client.query(
            `insert into public.notifications (user_id, type, title, body, data) values ($1, $2, $3, $4, $5)`,
            [appt.user_id, 'booking_update', 'Appointment cancelled',
             `Your booking with ${appt.specialist_name} at ${appt.hospital_name} was cancelled.`,
             JSON.stringify({ appointmentId: appt.id })]);
          await client.query('commit');
        } catch (err) {
          await client.query('rollback');
          throw err;
        } finally {
          client.release();
        }
        if (appt.run_id) {
          const run = await getRun(deps.pool, appt.run_id);
          if (run && run.status !== 'completed') {
            run.node = 'done'; run.status = 'completed';
            await logStep(deps.pool, run.id, 'postback', 'transition',
              { reEnteredVia: 'respond.cancel' }, { to: 'done', appointmentId: appt.id });
            await saveRun(deps.pool, run);
          }
        }
        return { ok: true, appointmentId: appt.id, status: 'cancelled' };
      }

      // re_match - the only action that reaches here, since the guard above
      // already rejected anything other than 'accept_reschedule' / 'cancel' / 're_match'.
      if (!['declined', 'reschedule_proposed'].includes(appt.status)) {
        return reply.code(409).send({ error: 'not_rematchable' });
      }
      // A run may hold only ONE live appointment. Without this, re-matching a
      // stale 'declined' appointment (which stays re-matchable forever) would
      // yank the run off a still-live booking and let it book a second one.
      if (appt.run_id) {
        const live = await deps.pool.query(
          `select 1 from public.appointments
            where run_id = $1 and id <> $2
              and status in ('pending', 'confirmed', 'reschedule_proposed')
            limit 1`,
          [appt.run_id, appt.id]);
        if (live.rows.length > 0) {
          return reply.code(409).send({ error: 'run_has_live_appointment' });
        }
      }
      if (appt.status === 'reschedule_proposed') {
        // Single write on this branch (no notification) - no transaction
        // needed. adapter.cancel (network call) still runs before it.
        await cancelAtHospital(deps, appt);
        await deps.pool.query(
          `update public.appointments set status = 'cancelled', status_source = 'appointmed' where id = $1`, [appt.id]);
      }
      if (!appt.run_id) return reply.code(409).send({ error: 'no_run_for_appointment' });
      const run = await getRun(deps.pool, appt.run_id);
      if (!run) return reply.code(409).send({ error: 'no_run_for_appointment' });
      run.node = 'match'; run.status = 'active';
      if (!run.state.excludeHospitalIds.includes(appt.hospital_id)) run.state.excludeHospitalIds.push(appt.hospital_id);
      await logStep(deps.pool, run.id, 'match', 'transition', { reEnteredVia: 'respond.re_match' }, { exclude: run.state.excludeHospitalIds });
      await saveRun(deps.pool, run);
      return matchAndPresent(deps, run);
    });
}
