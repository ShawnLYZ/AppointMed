import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { caseReport, ENGINE_FIX, makeTestContext, type TestContext } from './helpers.js';
import type { SlotOption } from '../src/workflow/types.js';

let ctx: TestContext;
beforeAll(async () => { ctx = await makeTestContext(); });
afterAll(async () => {
  await ctx.pool.query('delete from public.ai_chats where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.notifications where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.workflow_runs where user_id = $1', [ctx.userId]); // workflow_steps cascade
  await ctx.close();
});

// FakeAdapterClient is shared across every test in this file - reset its
// in-memory state before each test so no test can leak slots/failure flags
// into the next one.
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
// place while relaxing, and that state is the very same object the stub
// handed back (no cloning) - a shared literal would leak mutations from one
// test into the next. Each call below gets its own fresh object.
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

let currentRunId = '';

/**
 * Drives a fresh run from intake through triage into the match node's prefs
 * collection: enqueues completeIntake + the Cardiology triage verdict, sends
 * one message (lands in match/collecting), then enqueues the prefs decision
 * plus any relax decisions the resulting search is expected to consume, and
 * sends a second message that completes prefs and (if complete) drives
 * straight into matchAndPresent.
 */
async function driveToMatch(prefsDecision: unknown, relaxDecisions: unknown[] = []) {
  const { runId } = await start();
  currentRunId = runId;
  ctx.ollama.enqueue(completeIntake, cardiologyVerdict, caseReport());
  const first = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'that is everything' },
  });
  expect(first.statusCode).toBe(200);
  ctx.ollama.enqueue(prefsDecision, ...relaxDecisions);
  const second = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'here are my preferences' },
  });
  return second.json();
}

const getRunRow = async () => {
  const { rows } = await ctx.pool.query('select state from public.workflow_runs where id = $1', [currentRunId]);
  return rows[0];
};
const stepKinds = async () => {
  const { rows } = await ctx.pool.query(
    'select kind from public.workflow_steps where run_id = $1 order by seq', [currentRunId]);
  return rows.map((r: { kind: string }) => r.kind);
};

test('prefs are used: budget + hospital + morning filter the options', async () => {
  ctx.adapter.slotsByKey[ENGINE_FIX.keyA] = [
    slot({ startsAt: klIso(1, 9), price: 150 }), // matches: morning, in budget, hospital A
    slot({ startsAt: klIso(1, 9), price: 400 }), // over budget
    slot({ startsAt: klIso(1, 15), price: 150 }), // afternoon - wrong time of day
  ];
  ctx.adapter.slotsByKey[ENGINE_FIX.keyB] = [
    slot({ hospitalId: ENGINE_FIX.hospitalB, hospitalName: 'RLS Test Hospital B', startsAt: klIso(1, 9), price: 100 }),
  ];
  const body = await driveToMatch({
    reply: 'Got it!', complete: true,
    prefs: { budget: 200, preferredHospital: 'RLS Test Hospital A', preferredTime: 'morning' },
  });
  expect(body.node).toBe('match');
  expect(body.slotOptions).toHaveLength(1);
  expect(body.slotOptions[0]).toMatchObject({ hospitalId: ENGINE_FIX.hospitalA, price: 150 });
});

test('empty result triggers LLM-chosen relaxation (time) and a wider re-query with explanation', async () => {
  // only an afternoon slot exists; prefs demand morning → first search round is empty
  ctx.adapter.slotsByKey[ENGINE_FIX.keyA] = [slot({ startsAt: klIso(1, 15), price: 150 })];
  const morningPrefs = {
    reply: 'Great, thanks!', complete: true,
    prefs: { budget: null, preferredHospital: null, preferredTime: 'morning' },
  };
  const body = await driveToMatch(morningPrefs, [
    { relax: 'time', explanation: 'I widened the time of day to find you options sooner.' },
  ]);
  expect(body.slotOptions.length).toBeGreaterThan(0);
  expect(body.reply).toContain('widened the time');
  const run = await getRunRow();
  expect(run.state.relaxations).toEqual([
    { relaxed: 'time', explanation: expect.stringContaining('widened') },
  ]);
  const steps = await stepKinds();
  expect(steps.filter((k: string) => k === 'tool_call').length).toBeGreaterThanOrEqual(2); // two adapter queries
});

test('exhausted relaxations end with a friendly no-slots reply, run stays in match', async () => {
  // no slots configured at all (beforeEach already reset slotsByKey to {}) - every
  // search round comes back empty, so matchAndPresent relaxes time, hospital, then
  // budget (rounds 0-2) and gives up at round 3 without requesting a 4th relaxation.
  const body = await driveToMatch(anyPrefs(), [
    { relax: 'time', explanation: 'I widened the time of day to include more options.' },
    { relax: 'hospital', explanation: 'I expanded the search to more hospitals.' },
    { relax: 'budget', explanation: 'I relaxed the budget to show more options.' },
  ]);
  expect(body.reply).toContain("couldn't find");
  expect(body.slotOptions ?? []).toHaveLength(0);
  expect(body.node).toBe('match');
  expect(body.status).toBe('active');
});

test('adapter outage during search is a logged error with a retry-later reply, not a dead end', async () => {
  ctx.adapter.failNextGetSlots = true;
  const body = await driveToMatch(anyPrefs());
  expect(body.reply.toLowerCase()).toContain('unreachable');
  expect(await stepKinds()).toContain('error');
  expect(body.status).toBe('active');
});

test('incomplete prefs keep asking', async () => {
  const body = await driveToMatch({
    reply: 'Which hospital do you prefer?', complete: false,
    prefs: { budget: 200, preferredHospital: null, preferredTime: null },
  });
  expect(body.reply).toContain('hospital');
  expect(body.slotOptions).toBeUndefined();
});

test('relaxation budget resets on re-entry: a second matching cycle on the same run gets its own 3 attempts', async () => {
  // Cycle 1: exhaust all 3 relaxations - no slots configured anywhere (beforeEach reset
  // slotsByKey to {}), so every search round is empty and matchAndPresent gives up.
  const firstBody = await driveToMatch(anyPrefs(), [
    { relax: 'time', explanation: 'I widened the time of day to include more options.' },
    { relax: 'hospital', explanation: 'I expanded the search to more hospitals.' },
    { relax: 'budget', explanation: 'I relaxed the budget to show more options.' },
  ]);
  expect(firstBody.reply).toContain("couldn't find");
  const runId = currentRunId;
  const afterCycle1 = await getRunRow();
  expect(afterCycle1.state.relaxations).toHaveLength(3); // budget fully spent by cycle 1

  // Cycle 2: same run, fresh preferences. Only an afternoon slot exists at hospital A now,
  // so morning prefs mean round 0 comes back empty and matchAndPresent must relax time
  // (round 0 -> 1) to find it. Without the fix, run.state.relaxations is already at 3 from
  // cycle 1, so the give-up check fires on round 0 and no relaxation (or slot) is ever tried.
  ctx.adapter.slotsByKey[ENGINE_FIX.keyA] = [slot({ startsAt: klIso(1, 15), price: 150 })];
  const morningPrefs = {
    reply: 'Great, thanks!', complete: true,
    prefs: { budget: null, preferredHospital: null, preferredTime: 'morning' },
  };
  ctx.ollama.enqueue(morningPrefs, { relax: 'time', explanation: 'I widened the time of day to find you options sooner.' });
  const second = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'can we try again with different preferences' },
  });
  expect(second.statusCode).toBe(200);
  const body = second.json();
  expect(body.slotOptions.length).toBeGreaterThan(0);
  const afterCycle2 = await getRunRow();
  expect(afterCycle2.state.relaxations).toEqual([
    { relaxed: 'time', explanation: expect.stringContaining('widened') },
  ]);
});
