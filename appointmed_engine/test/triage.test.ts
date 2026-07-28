import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => { ctx = await makeTestContext(); });
afterAll(async () => {
  await ctx.pool.query('delete from public.ai_chats where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.notifications where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.workflow_runs where user_id = $1', [ctx.userId]); // workflow_steps cascade
  await ctx.close();
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

test('completed intake triggers triage: verdict + disclaimer + first prefs question', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue(completeIntake, {
    specialty: 'Cardiology', urgency: 'week',
    explanation: 'Exertional chest tightness with hypertension warrants a cardiology review.',
    redFlags: [],
  });
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'that is everything' },
  });
  const body = res.json();
  expect(body.node).toBe('match');
  expect(body.verdict).toMatchObject({ specialty: 'Cardiology', urgency: 'week' });
  expect(body.reply).toContain('Cardiology');
  expect(body.reply).toContain('within a week');
  expect(body.reply).toContain('not a medical diagnosis');
  expect(body.reply.toLowerCase()).toContain('budget');
  const run = await ctx.pool.query('select current_node, state from public.workflow_runs where id = $1', [runId]);
  expect(run.rows[0].current_node).toBe('match');
  expect(run.rows[0].state.matchPhase).toBe('collecting');
});

test('triage model failure falls back to General Practice / routine and logs a fallback step', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue(completeIntake, new Error('ollama down'));
  // OllamaStub throws once per structured() call; OllamaHttpClient retries internally,
  // but the stub replaces the whole client - one enqueue(Error) = one failed structured() call.
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'done' },
  });
  const body = res.json();
  expect(body.verdict?.specialty).toBe('General Practice');
  expect(body.reply).toContain('General Practice');
  const steps = await ctx.pool.query('select kind, node from public.workflow_steps where run_id = $1', [runId]);
  expect(steps.rows.some((r: { kind: string; node: string }) => r.kind === 'fallback' && r.node === 'triage')).toBe(true);
});
