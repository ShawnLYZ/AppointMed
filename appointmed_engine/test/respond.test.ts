import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { ENGINE_FIX, makeTestContext, type TestContext } from './helpers.js';
import { makeSupabase } from '../src/supabase.js';
import { config } from '../src/config.js';
import type { SlotOption } from '../src/workflow/types.js';

let ctx: TestContext;
// A genuine appointment owned by a DIFFERENT patient, used only by the
// owner-only lookup test below - a random/nonexistent id would 404 even with
// a buggy query that forgets "and user_id = $2", so this has to be a real
// foreign row to actually exercise directive #2 (owner-only /respond).
let foreignAppointmentId = '';

beforeAll(async () => {
  ctx = await makeTestContext();

  const admin = makeSupabase(config.supabaseUrl, config.supabaseServiceRoleKey);
  const foreignEmail = 'engine-patient-foreign@test.appointmed.demo';
  const existing = await ctx.pool.query('select id from auth.users where email = $1', [foreignEmail]);
  let foreignUserId: string;
  if (existing.rows.length > 0) {
    foreignUserId = existing.rows[0].id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: foreignEmail, password: ENGINE_FIX.password, email_confirm: true,
      app_metadata: { role: 'patient' }, user_metadata: { full_name: 'Engine Foreign Patient' },
    });
    if (error) throw new Error(error.message);
    foreignUserId = data.user.id;
  }
  const ins = await ctx.pool.query(
    `insert into public.appointments (user_id, patient_name, hospital_id, hospital_name, specialty, starts_at, status)
     values ($1, 'Engine Foreign Patient', $2, 'RLS Test Hospital A', 'Cardiology', now() + interval '3 days', 'pending')
     returning id`,
    [foreignUserId, ENGINE_FIX.hospitalA]);
  foreignAppointmentId = ins.rows[0].id;
});

afterAll(async () => {
  await ctx.pool.query('delete from public.appointments where id = $1', [foreignAppointmentId]);
  await ctx.pool.query('delete from public.appointments where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.ai_chats where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.notifications where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.workflow_runs where user_id = $1', [ctx.userId]); // steps cascade
  await ctx.close();
});

// FakeAdapterClient is shared across every test in this file - reset its
// in-memory state before each test so no test can leak slots/failure flags
// into the next one (mirrors test/booking.test.ts / test/postback.test.ts).
beforeEach(() => {
  ctx.adapter.slotsByKey = {};
  ctx.adapter.failNextGetSlots = false;
  ctx.adapter.failNextConfirm = false;
  ctx.adapter.failNextCancel = false;
});

const auth = () => ({ authorization: `Bearer ${ctx.token}` });
const start = async () => {
  const res = await ctx.app.inject({ method: 'POST', url: '/consult/start', headers: auth() });
  expect(res.statusCode).toBe(200);
  return res.json();
};

const completeIntake = {
  reply: 'Thank you, I have everything I need.', complete: true, redFlag: false,
  fields: { mainComplaint: 'chest tightness on exertion', duration: '2 weeks', severity: 6,
    associatedSymptoms: 'breathless climbing stairs', medicalHistory: 'hypertension', currentMedications: 'amlodipine' },
};
const cardiologyVerdict = {
  specialty: 'Cardiology', urgency: 'week',
  explanation: 'Exertional chest tightness with hypertension warrants a cardiology review.',
  redFlags: [],
};
// Factory, not a shared constant: matchAndPresent mutates run.state.prefs in
// place while relaxing - each call gets its own fresh object so no test can
// leak mutations into the next (see test/booking.test.ts / test/match.test.ts).
const anyPrefs = () => ({
  reply: 'Thanks, got it!', complete: true,
  prefs: { budget: 300, preferredHospital: null, preferredTime: 'any' },
});

/** Kuala Lumpur is UTC+8 year-round (no DST): a KL wall-clock hour maps to (klHour - 8) UTC. */
function klIso(daysFromNow: number, klHour: number): string {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromNow, klHour - 8, 0, 0, 0,
  )).toISOString();
}

let slotSeq = 0;
function slot(overrides: Partial<SlotOption> = {}): SlotOption {
  slotSeq += 1;
  return {
    id: `slot_${slotSeq}`,
    specialistId: ENGINE_FIX.specialistA,
    specialistName: 'Dr. Engine Cardio',
    specialty: 'Cardiology',
    startsAt: klIso(1, 9),
    endsAt: klIso(1, 10),
    price: 150,
    hospitalId: ENGINE_FIX.hospitalA,
    hospitalName: 'RLS Test Hospital A',
    hospitalAddress: '1 Test Street',
    ...overrides,
  };
}

/** See test/booking.test.ts - drives a fresh run to matchAndPresent's presented options at hospital A. */
async function driveToPresented(): Promise<{ runId: string; slot: SlotOption }> {
  ctx.adapter.slotsByKey[ENGINE_FIX.keyA] = [slot()];
  const { runId } = await start();
  ctx.ollama.enqueue(completeIntake, cardiologyVerdict);
  const first = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'that is everything' },
  });
  expect(first.statusCode).toBe(200);
  ctx.ollama.enqueue(anyPrefs());
  const second = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'here are my preferences' },
  });
  const body = second.json();
  expect(body.slotOptions?.length).toBeGreaterThan(0);
  return { runId, slot: body.slotOptions[0] };
}

/**
 * Drives a full run to a pending appointment booked against hospital A (see
 * test/postback.test.ts). Consumes 4 ollama decisions total (intake, triage,
 * prefs, case summary).
 */
async function bookViaFlow(): Promise<{ runId: string; appointmentId: string; externalAppointmentId: string; hospitalId: string }> {
  const { runId, slot: presented } = await driveToPresented();
  ctx.ollama.enqueue({ summary: 'Case summary for the hospital team.', priority: 'medium' });
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/select-slot`, headers: auth(), payload: { slotId: presented.id },
  });
  expect(res.statusCode).toBe(200);
  const appointmentId = res.json().appointment.id as string;
  const row = await ctx.pool.query(
    'select external_appointment_id, hospital_id from public.appointments where id = $1', [appointmentId]);
  return {
    runId, appointmentId,
    externalAppointmentId: row.rows[0].external_appointment_id,
    hospitalId: row.rows[0].hospital_id,
  };
}

const postback = (payload: object) => ctx.app.inject({
  method: 'POST', url: '/postback', headers: { 'x-postback-secret': 'appointmed-postback-demo-secret' }, payload,
});

const respond = (appointmentId: string, action: 'accept_reschedule' | 're_match' | 'cancel') => ctx.app.inject({
  method: 'POST', url: `/appointments/${appointmentId}/respond`, headers: auth(), payload: { action },
});

test('accept_reschedule after a rescheduled postback confirms the proposed time and completes the run', async () => {
  const b = await bookViaFlow();
  const proposed = new Date(Date.now() + 4 * 86400000).toISOString();
  await postback({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'rescheduled', proposedStartsAt: proposed });

  const res = await respond(b.appointmentId, 'accept_reschedule');
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ ok: true, status: 'confirmed' });

  const appt = await ctx.pool.query(
    'select status, starts_at, proposed_starts_at from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('confirmed');
  expect(appt.rows[0].starts_at.toISOString()).toBe(proposed);
  expect(appt.rows[0].proposed_starts_at).toBeNull();

  const run = await ctx.pool.query('select status, current_node from public.workflow_runs where id = $1', [b.runId]);
  expect(run.rows[0]).toEqual({ status: 'completed', current_node: 'done' });
});

test('re_match after a declined postback returns fresh slotOptions from the remaining hospital only', async () => {
  const b = await bookViaFlow(); // booked against hospital A
  await postback({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'declined' });
  // Hospital A is now excluded by the declined postback. Give hospital B a
  // matching slot so the re-entered matchAndPresent finds it on the very
  // first search round - deterministic, and consumes no RelaxDecision (the
  // OllamaStub queue for 'relax' stays empty on purpose).
  ctx.adapter.slotsByKey[ENGINE_FIX.keyB] = [slot({ hospitalId: ENGINE_FIX.hospitalB, hospitalName: 'RLS Test Hospital B' })];

  const res = await respond(b.appointmentId, 're_match');
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.slotOptions.length).toBeGreaterThan(0);
  expect(body.slotOptions.every((s: SlotOption) => s.hospitalId === ENGINE_FIX.hospitalB)).toBe(true);

  const run = await ctx.pool.query('select current_node, status, state from public.workflow_runs where id = $1', [b.runId]);
  expect(run.rows[0].current_node).toBe('match');
  expect(run.rows[0].status).toBe('active');
  expect(run.rows[0].state.excludeHospitalIds).toContain(b.hospitalId);
});

test('re_match after a reschedule_proposed appointment cancels it via the adapter first', async () => {
  const b = await bookViaFlow(); // booked against hospital A
  const proposed = new Date(Date.now() + 4 * 86400000).toISOString();
  await postback({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'rescheduled', proposedStartsAt: proposed });
  // re_match excludes the appointment's hospital unconditionally (both the
  // declined and reschedule_proposed paths funnel into the same exclude+
  // matchAndPresent tail) - hospital A's own slot would no longer be
  // eligible, so hospital B needs a slot for the search to succeed on round 0.
  ctx.adapter.slotsByKey[ENGINE_FIX.keyB] = [slot({ hospitalId: ENGINE_FIX.hospitalB, hospitalName: 'RLS Test Hospital B' })];

  const cancelsBefore = ctx.adapter.cancels.length;
  const res = await respond(b.appointmentId, 're_match');
  expect(res.statusCode).toBe(200);
  expect(ctx.adapter.cancels.length).toBe(cancelsBefore + 1);
  expect(ctx.adapter.cancels[ctx.adapter.cancels.length - 1]).toMatchObject({ externalAppointmentId: b.externalAppointmentId });

  const appt = await ctx.pool.query('select status, status_source from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('cancelled');
  // A patient-initiated re_match cancel must be attributed to appointmed, not
  // left over as 'hospital_postback' from the earlier reschedule postback.
  expect(appt.rows[0].status_source).toBe('appointmed');

  const run = await ctx.pool.query('select current_node, state from public.workflow_runs where id = $1', [b.runId]);
  expect(run.rows[0].current_node).toBe('match');
  expect(run.rows[0].state.excludeHospitalIds).toContain(b.hospitalId);
});

test('re_match on a stale declined appointment is rejected once the run already has a live appointment (double-booking guard)', async () => {
  const a = await bookViaFlow(); // A booked against hospital A
  await postback({ externalAppointmentId: a.externalAppointmentId, hospitalId: a.hospitalId, action: 'declined' });
  // A is now 'declined' forever - the postback path never revisits it (unlike
  // reschedule_proposed, which self-heals to 'cancelled'). Give hospital B a
  // matching slot so the legitimate re_match below succeeds on round 0.
  ctx.adapter.slotsByKey[ENGINE_FIX.keyB] = [slot({ hospitalId: ENGINE_FIX.hospitalB, hospitalName: 'RLS Test Hospital B' })];

  const firstRematch = await respond(a.appointmentId, 're_match');
  expect(firstRematch.statusCode).toBe(200);
  const presentedB = firstRematch.json().slotOptions[0];

  // Patient books B against hospital B - the run's one live appointment is now B, not A.
  ctx.ollama.enqueue({ summary: 'Case summary for the hospital team.', priority: 'medium' });
  const bookB = await ctx.app.inject({
    method: 'POST', url: `/consult/${a.runId}/select-slot`, headers: auth(), payload: { slotId: presentedB.id },
  });
  expect(bookB.statusCode).toBe(200);
  const appointmentBId = bookB.json().appointment.id as string;

  // Replay: a stale/duplicate client calls re_match again on A, which is STILL
  // 'declined'. Without the guard this yanks the run off B and re-presents
  // fresh slots, letting a subsequent select-slot double-book.
  const confirmsBefore = ctx.adapter.confirms.length;
  const replay = await respond(a.appointmentId, 're_match');
  expect(replay.statusCode).toBe(409);
  expect(replay.json()).toEqual({ error: 'run_has_live_appointment' });
  expect(ctx.adapter.confirms.length).toBe(confirmsBefore); // rejected before any adapter call

  const run = await ctx.pool.query('select status, current_node from public.workflow_runs where id = $1', [a.runId]);
  expect(run.rows[0]).toEqual({ status: 'waiting_hospital', current_node: 'hospital_review' }); // NOT yanked off B

  const apptB = await ctx.pool.query('select status from public.appointments where id = $1', [appointmentBId]);
  expect(apptB.rows[0].status).toBe('pending');
});

test("responding to a foreign patient's appointment returns 404, never someone else's row", async () => {
  const res = await respond(foreignAppointmentId, 'cancel');
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ error: 'appointment_not_found' });
});

test('accept_reschedule on a pending appointment → 409 not_reschedule_proposed', async () => {
  const b = await bookViaFlow();
  const res = await respond(b.appointmentId, 'accept_reschedule');
  expect(res.statusCode).toBe(409);
  expect(res.json()).toEqual({ error: 'not_reschedule_proposed' });
});

test('cancel on a pending appointment: adapter.cancel is called, status becomes cancelled, notification inserted, run completes', async () => {
  const b = await bookViaFlow();
  const cancelsBefore = ctx.adapter.cancels.length;
  const res = await respond(b.appointmentId, 'cancel');
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ ok: true, status: 'cancelled' });
  expect(ctx.adapter.cancels.length).toBe(cancelsBefore + 1);
  expect(ctx.adapter.cancels[ctx.adapter.cancels.length - 1]).toMatchObject({ externalAppointmentId: b.externalAppointmentId });

  const appt = await ctx.pool.query('select status, status_source from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0]).toEqual({ status: 'cancelled', status_source: 'appointmed' });

  const notif = await ctx.pool.query(
    `select title from public.notifications where user_id = $1 and (data->>'appointmentId') = $2 order by created_at desc limit 1`,
    [ctx.userId, b.appointmentId]);
  expect(notif.rows[0].title).toContain('cancelled');

  const run = await ctx.pool.query('select status, current_node from public.workflow_runs where id = $1', [b.runId]);
  expect(run.rows[0]).toEqual({ status: 'completed', current_node: 'done' });

  // audit trail: the run-completion transition itself must be logged, same as
  // the postback path and re_match already do.
  const transitionStep = await ctx.pool.query(
    `select output from public.workflow_steps
      where run_id = $1 and kind = 'transition' and node = 'postback' and (input->>'reEnteredVia') = 'respond.cancel'`,
    [b.runId]);
  expect(transitionStep.rows.length).toBe(1);
  expect(transitionStep.rows[0].output).toMatchObject({ to: 'done', appointmentId: b.appointmentId });
});

test('cancel on an already-cancelled appointment → 409 not_cancellable', async () => {
  const b = await bookViaFlow();
  const first = await respond(b.appointmentId, 'cancel');
  expect(first.statusCode).toBe(200);
  const second = await respond(b.appointmentId, 'cancel');
  expect(second.statusCode).toBe(409);
  expect(second.json()).toEqual({ error: 'not_cancellable' });
});

// --- Security-review fix wave: best-effort adapter.cancel, invalid-action guard ---

test('cancel is best-effort: an adapter outage does not block the patient cancel', async () => {
  const b = await bookViaFlow();
  ctx.adapter.failNextCancel = true;
  const res = await respond(b.appointmentId, 'cancel');
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ ok: true, status: 'cancelled' });
  const appt = await ctx.pool.query('select status from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('cancelled');
});

test('an invalid action value is rejected before reaching the destructive re_match fallthrough', async () => {
  const b = await bookViaFlow();
  const proposed = new Date(Date.now() + 4 * 86400000).toISOString();
  await postback({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'rescheduled', proposedStartsAt: proposed });

  const cancelsBefore = ctx.adapter.cancels.length;
  const res = await ctx.app.inject({
    method: 'POST', url: `/appointments/${b.appointmentId}/respond`, headers: auth(), payload: { action: 'cancle' },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: 'invalid_action' });
  expect(ctx.adapter.cancels.length).toBe(cancelsBefore);

  const appt = await ctx.pool.query('select status from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('reschedule_proposed');
});
