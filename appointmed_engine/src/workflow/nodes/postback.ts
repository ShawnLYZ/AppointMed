import { getRun, logStep, saveRun } from '../runs.js';
import type { EngineDeps } from '../../server.js';

export interface PostbackBody {
  externalAppointmentId: string;
  hospitalId: string;
  action: 'confirmed' | 'declined' | 'rescheduled' | 'cancelled';
  proposedStartsAt?: string;
}

interface ApptRow {
  id: string; user_id: string; run_id: string | null;
  hospital_id: string; hospital_name: string; specialist_name: string;
}

const STATUS_MAP = { confirmed: 'confirmed', declined: 'declined',
  rescheduled: 'reschedule_proposed', cancelled: 'cancelled' } as const;
const TITLE_MAP = { confirmed: 'Appointment confirmed 🎉', declined: 'Booking declined',
  rescheduled: 'New time proposed', cancelled: 'Appointment cancelled' } as const;

export async function applyPostback(deps: EngineDeps, body: PostbackBody):
  Promise<{ ok: true; appointmentId: string; status: string } | { notFound: true }> {
  // The appointments UPDATE and its notification are related writes that
  // must commit together (Phase-3 atomicity policy) - no network call is
  // made on this path, so both fit in one transaction. The run read/save
  // stays outside: it's engine state, and getRun/saveRun already take a Pool.
  const client = await deps.pool.connect();
  let appt: ApptRow | null = null;
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `update public.appointments
          set status = $2, status_source = 'hospital_postback', proposed_starts_at = $3
        where external_appointment_id = $1 and hospital_id = $4
          and status in ('pending', 'confirmed', 'reschedule_proposed')
        returning id, user_id, run_id, hospital_id, hospital_name, specialist_name`,
      [body.externalAppointmentId, STATUS_MAP[body.action], body.proposedStartsAt ?? null, body.hospitalId]);
    if (rows.length > 0) {
      appt = rows[0];
      const message = body.action === 'rescheduled'
        ? `${appt!.hospital_name} proposed a new time for ${appt!.specialist_name}. Open the app to accept or re-match.`
        : `${appt!.hospital_name}: your booking with ${appt!.specialist_name} is now ${STATUS_MAP[body.action]}.`;
      await client.query(
        `insert into public.notifications (user_id, type, title, body, data) values ($1, $2, $3, $4, $5)`,
        [appt!.user_id, 'booking_update', TITLE_MAP[body.action], message,
         JSON.stringify({ appointmentId: appt!.id, action: body.action })]);
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
  if (!appt) return { notFound: true };

  if (appt.run_id) {
    const run = await getRun(deps.pool, appt.run_id);
    if (run && run.status !== 'completed') {
      await logStep(deps.pool, run.id, 'postback', 'transition',
        { action: body.action, externalAppointmentId: body.externalAppointmentId },
        { appointmentStatus: STATUS_MAP[body.action] });
      if (body.action === 'confirmed' || body.action === 'cancelled') { run.node = 'done'; run.status = 'completed'; }
      if (body.action === 'declined') {
        run.node = 'match'; run.status = 'active';
        run.state.matchPhase = 'ready';
        if (!run.state.excludeHospitalIds.includes(appt.hospital_id)) {
          run.state.excludeHospitalIds.push(appt.hospital_id);
        }
      }
      await saveRun(deps.pool, run);
    }
  }
  return { ok: true, appointmentId: appt.id, status: STATUS_MAP[body.action] };
}
