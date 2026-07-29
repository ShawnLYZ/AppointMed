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
// into the next one (mirrors test/match.test.ts).
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
// place while relaxing (test/match.test.ts's rationale) - each call gets its
// own fresh object so no test can leak mutations into the next.
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
 * matchAndPresent's presented options: a single slot at hospital A that
 * satisfies budget/hospital/time on the first search round, so no
 * relaxations are needed and exactly 4 ollama decisions are consumed
 * (completeIntake, the triage verdict, the case report, then prefs).
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

test('selecting a slot books via the adapter with the right hospital key and creates a pending request', async () => {
  const { runId, slot } = await driveToPresented();
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/select-slot`, headers: auth(), payload: { slotId: slot.id },
  });
  const body = res.json();
  expect(body.node).toBe('hospital_review');
  expect(body.status).toBe('waiting_hospital');
  expect(body.appointment).toMatchObject({ status: 'pending', hospitalName: slot.hospitalName });
  expect(body.reply).toContain('pending');

  expect(ctx.adapter.confirms).toEqual([
    expect.objectContaining({ apiKey: ENGINE_FIX.keyA, slotId: slot.id, patientName: 'Engine Test Patient' }),
  ]);
  const appt = await ctx.pool.query('select * from public.appointments where id = $1', [body.appointment.id]);
  expect(appt.rows[0]).toMatchObject({
    status: 'pending', status_source: 'appointmed', created_via_ai: true,
    suggested_priority: 'medium', slot_id: null, external_slot_id: slot.id, run_id: runId,
  });
  expect(appt.rows[0].external_appointment_id).toMatch(/^ext_fake_/);
  const notif = await ctx.pool.query(
    `select type from public.notifications where user_id = $1 order by created_at desc limit 1`, [ctx.userId]);
  expect(notif.rows[0].type).toBe('booking_update');
});

test('adapter failure on confirm keeps the run alive with a retry reply', async () => {
  const { runId, slot } = await driveToPresented();
  ctx.adapter.failNextConfirm = true;
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/select-slot`, headers: auth(), payload: { slotId: slot.id },
  });
  const body = res.json();
  expect(res.statusCode).toBe(200);
  expect(body.appointment).toBeUndefined();
  expect(body.node).toBe('match');
  expect(body.reply.toLowerCase()).toContain('try');
});

test('selecting an unknown slot id → 400', async () => {
  const { runId } = await driveToPresented();
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/select-slot`, headers: auth(),
    payload: { slotId: '00000000-0000-4000-8000-00000000dead' },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: 'unknown_slot_option' });
});

test('a second select-slot on a booked run is rejected (no duplicate confirm or appointment)', async () => {
  const { runId, slot } = await driveToPresented();
  const first = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/select-slot`, headers: auth(), payload: { slotId: slot.id },
  });
  expect(first.statusCode).toBe(200);
  const confirmsAfterFirst = ctx.adapter.confirms.length;

  const second = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/select-slot`, headers: auth(), payload: { slotId: slot.id },
  });
  expect(second.statusCode).toBe(409);
  expect(second.json()).toEqual({ error: 'already_booked' });
  // no second adapter confirm, and still exactly one appointment for this run
  expect(ctx.adapter.confirms.length).toBe(confirmsAfterFirst);
  const appts = await ctx.pool.query('select id from public.appointments where run_id = $1', [runId]);
  expect(appts.rows).toHaveLength(1);
});

test('booking persists the full report and a path-free attachment manifest', async () => {
  const { runId, slot } = await driveToPresented();
  // Give the run an attachment with a storage path, as a real upload would.
  await ctx.pool.query(
    `update public.workflow_runs
        set state = jsonb_set(state, '{attachments}', $2::jsonb)
      where id = $1`,
    [runId, JSON.stringify([{
      type: 'image', name: 'rash.png',
      path: `${ctx.userId}/${runId}/secret-filename.png`,
      observation: 'Erythematous plaque on the left forearm.',
    }])]);

  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/select-slot`, headers: auth(), payload: { slotId: slot.id },
  });
  expect(res.statusCode).toBe(200);

  const appt = await ctx.pool.query(
    'select ai_summary, ai_report, ai_attachments, suggested_priority from public.appointments where id = $1',
    [res.json().appointment.id]);
  const row = appt.rows[0];

  expect(row.ai_report.generated).toBe('model');
  expect(row.ai_report.chiefComplaint).toBe('Chest tightness on exertion');
  expect(row.ai_summary).toBe(row.ai_report.summary);
  expect(row.suggested_priority).toBe(row.ai_report.priority);

  expect(row.ai_attachments).toEqual([
    { type: 'image', name: 'rash.png', observation: 'Erythematous plaque on the left forearm.' },
  ]);
  // The storage path must never reach a column a client can read.
  expect(JSON.stringify(row.ai_attachments)).not.toContain('secret-filename.png');
});

test('the one-line summary is forwarded to the hospital system as a booking note', async () => {
  const { runId, slot } = await driveToPresented();
  await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/select-slot`, headers: auth(), payload: { slotId: slot.id },
  });
  expect(ctx.adapter.confirms.at(-1)).toMatchObject({
    slotId: slot.id,
    note: 'Exertional chest tightness, 2 weeks, severity 6/10, hypertensive on amlodipine.',
  });
});

test('the booking reply tells the patient what was shared with the hospital', async () => {
  const { runId, slot } = await driveToPresented();
  await ctx.pool.query(
    `update public.workflow_runs set state = jsonb_set(state, '{attachments}', $2::jsonb) where id = $1`,
    [runId, JSON.stringify([{ type: 'image', name: 'rash.png', path: 'x/y/z.png', observation: 'A rash.' }])]);
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/select-slot`, headers: auth(), payload: { slotId: slot.id },
  });
  const reply = res.json().reply;
  expect(reply).toContain('RLS Test Hospital A');
  expect(reply).toContain('rash.png');
});
