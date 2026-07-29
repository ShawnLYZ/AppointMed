import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { caseReport, ENGINE_FIX, makeTestContext, type TestContext } from './helpers.js';
import type { SlotOption } from '../src/workflow/types.js';

let ctx: TestContext;
beforeAll(async () => { ctx = await makeTestContext(); });
afterAll(async () => {
  await ctx.pool.query('delete from public.appointments where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.ai_chats where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.notifications where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.workflow_runs where user_id = $1', [ctx.userId]); // steps cascade
  await ctx.close();
});

// FakeAdapterClient is shared across every test in this file - reset its
// in-memory state before each test so no test can leak slots/failure flags
// into the next one (mirrors test/booking.test.ts).
beforeEach(() => {
  ctx.adapter.slotsByKey = {};
  ctx.adapter.failNextGetSlots = false;
  ctx.adapter.failNextConfirm = false;
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

/**
 * Drives a fresh run from intake through triage and prefs collection into
 * matchAndPresent's presented options (see test/booking.test.ts): a single
 * slot at hospital A that satisfies budget/hospital/time on the first search
 * round, so no relaxations are needed and exactly 4 ollama decisions are
 * consumed (completeIntake, the triage verdict, the case report, then prefs).
 */
async function driveToPresented(): Promise<{ runId: string; slot: SlotOption }> {
  ctx.adapter.slotsByKey[ENGINE_FIX.keyA] = [slot()];
  const { runId } = await start();
  ctx.ollama.enqueue(completeIntake, cardiologyVerdict, caseReport());
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
 * Drives a full run to a pending appointment booked against hospital A
 * (Task-7 helpers, plus the select-slot call). Booking itself is a pure
 * database write now - no ollama decision beyond driveToPresented's 4.
 * Returns the fields postback needs that the /consult API response never
 * surfaces, read back from the appointments row it just created.
 */
async function bookViaFlow(): Promise<{ runId: string; appointmentId: string; externalAppointmentId: string; hospitalId: string }> {
  const { runId, slot: presented } = await driveToPresented();
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

const post = (payload: object, secret = 'appointmed-postback-demo-secret') =>
  ctx.app.inject({ method: 'POST', url: '/postback', headers: { 'x-postback-secret': secret }, payload });

test('wrong secret → 401; unknown external id → 404', async () => {
  expect((await post({}, 'wrong')).statusCode).toBe(401);
  expect((await post({ externalAppointmentId: 'ext_nope', hospitalId: ENGINE_FIX.hospitalA, action: 'confirmed' })).statusCode).toBe(404);
});

test('confirmed postback flips status, sets hospital_postback source, notifies, completes run', async () => {
  const b = await bookViaFlow();
  const res = await post({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'confirmed' });
  expect(res.json()).toMatchObject({ ok: true, status: 'confirmed' });
  const appt = await ctx.pool.query('select status, status_source from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0]).toEqual({ status: 'confirmed', status_source: 'hospital_postback' });
  const run = await ctx.pool.query('select status, current_node from public.workflow_runs where id = $1', [b.runId]);
  expect(run.rows[0]).toEqual({ status: 'completed', current_node: 'done' });
  const notif = await ctx.pool.query(
    `select title from public.notifications where user_id = $1 and (data->>'appointmentId') = $2 order by created_at desc limit 1`,
    [ctx.userId, b.appointmentId]);
  expect(notif.rows[0].title).toContain('confirmed');
});

test('declined postback re-enters match with the hospital excluded', async () => {
  const b = await bookViaFlow();
  await post({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'declined' });
  const appt = await ctx.pool.query('select status from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('declined');
  const run = await ctx.pool.query('select status, current_node, state from public.workflow_runs where id = $1', [b.runId]);
  expect(run.rows[0].current_node).toBe('match');
  expect(run.rows[0].status).toBe('active');
  expect(run.rows[0].state.excludeHospitalIds).toContain(b.hospitalId);
  expect(run.rows[0].state.matchPhase).toBe('ready');
});

test('rescheduled postback stores the proposed time', async () => {
  const b = await bookViaFlow();
  const proposed = new Date(Date.now() + 4 * 86400000).toISOString();
  await post({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'rescheduled', proposedStartsAt: proposed });
  const appt = await ctx.pool.query('select status, proposed_starts_at from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('reschedule_proposed');
  expect(appt.rows[0].proposed_starts_at.toISOString()).toBe(proposed);
});

// --- Security-review fix wave: postback scoping, payload validation, idempotency ---

test('empty externalAppointmentId is rejected, not treated as a wildcard match', async () => {
  // A second appointment for the SAME user, inserted directly so it keeps the
  // column default '' - this is the row a wildcard `where external_appointment_id
  // = ''` would incorrectly match. Cleaned up by the file's existing afterAll
  // (user_id = ctx.userId).
  const ins = await ctx.pool.query(
    `insert into public.appointments (user_id, patient_name, hospital_id, hospital_name, specialty, starts_at, status)
     values ($1, 'Engine Test Patient', $2, 'RLS Test Hospital A', 'Cardiology', now() + interval '3 days', 'pending')
     returning id`,
    [ctx.userId, ENGINE_FIX.hospitalA]);
  const emptyIdAppointmentId = ins.rows[0].id;

  const res = await post({ externalAppointmentId: '', hospitalId: ENGINE_FIX.hospitalA, action: 'cancelled' });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: 'invalid_postback' });

  const appt = await ctx.pool.query('select status from public.appointments where id = $1', [emptyIdAppointmentId]);
  expect(appt.rows[0].status).toBe('pending');
});

test('postback with the wrong hospitalId 404s and leaves the appointment unchanged', async () => {
  const b = await bookViaFlow(); // booked against hospital A
  const res = await post({ externalAppointmentId: b.externalAppointmentId, hospitalId: ENGINE_FIX.hospitalB, action: 'confirmed' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ error: 'unknown_external_id' });
  const appt = await ctx.pool.query('select status from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('pending');
});

test('invalid action value → 400 invalid_postback, appointment unchanged', async () => {
  const b = await bookViaFlow();
  const res = await post({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'bogus' });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: 'invalid_postback' });
  const appt = await ctx.pool.query('select status from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('pending');
});

test('rescheduled action without proposedStartsAt → 400 invalid_postback, appointment unchanged', async () => {
  const b = await bookViaFlow();
  const res = await post({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'rescheduled' });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: 'invalid_postback' });
  const appt = await ctx.pool.query('select status from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('pending');
});

test('a postback on an already-terminal appointment 404s and does not reopen the run', async () => {
  const b = await bookViaFlow();
  const cancelRes = await post({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'cancelled' });
  expect(cancelRes.statusCode).toBe(200);

  const res = await post({ externalAppointmentId: b.externalAppointmentId, hospitalId: b.hospitalId, action: 'confirmed' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ error: 'unknown_external_id' });

  const appt = await ctx.pool.query('select status from public.appointments where id = $1', [b.appointmentId]);
  expect(appt.rows[0].status).toBe('cancelled');
  const run = await ctx.pool.query('select status, current_node from public.workflow_runs where id = $1', [b.runId]);
  expect(run.rows[0]).toEqual({ status: 'completed', current_node: 'done' });
});

test('missing secret header entirely → 401', async () => {
  const res = await ctx.app.inject({ method: 'POST', url: '/postback', payload: {} });
  expect(res.statusCode).toBe(401);
});
