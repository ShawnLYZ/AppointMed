import { afterAll, beforeAll, expect, test } from 'vitest';
import { caseReport, makeTestContext, type TestContext } from './helpers.js';

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
  }, caseReport());
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
  ctx.ollama.enqueue(completeIntake, new Error('ollama down'), new Error('ollama down'));
  // OllamaStub throws once per structured() call; OllamaHttpClient retries internally,
  // but the stub replaces the whole client - one enqueue(Error) = one failed structured() call.
  // Two errors: the triage verdict falls back to General Practice, and the case-report
  // call that now runs right after it in the same request needs its own failure too -
  // otherwise it hits an empty queue, which throws a plain Error (not OllamaUnavailableError)
  // and would surface as an uncaught 500 instead of a second fallback.
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'done' },
  });
  const body = res.json();
  expect(body.verdict?.specialty).toBe('General Practice');
  expect(body.reply).toContain('General Practice');
  const steps = await ctx.pool.query('select kind, node from public.workflow_steps where run_id = $1', [runId]);
  expect(steps.rows.some((r: { kind: string; node: string }) => r.kind === 'fallback' && r.node === 'triage')).toBe(true);
});

test('triage stores a model-generated case report on the run', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue(completeIntake, {
    specialty: 'Cardiology', urgency: 'week', explanation: 'Warrants review.', redFlags: [],
  }, caseReport());
  await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'that is everything' },
  });
  const run = await ctx.pool.query('select state from public.workflow_runs where id = $1', [runId]);
  const report = run.rows[0].state.report;
  expect(report.generated).toBe('model');
  expect(report.triageDegraded).toBe(false);
  expect(report.chiefComplaint).toBe('Chest tightness on exertion');
  expect(report.priority).toBe('medium');
});

test('an unreachable summary stage stores a fallback report and logs it', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue(completeIntake, {
    specialty: 'Cardiology', urgency: 'week', explanation: 'Warrants review.', redFlags: [],
  }, new Error('ollama down'));
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'done' },
  });
  // The patient still gets their verdict - a report failure never blocks triage.
  expect(res.json().verdict?.specialty).toBe('Cardiology');
  const run = await ctx.pool.query('select state from public.workflow_runs where id = $1', [runId]);
  expect(run.rows[0].state.report.generated).toBe('fallback');
  expect(run.rows[0].state.report.triageDegraded).toBe(false); // triage itself succeeded
  const steps = await ctx.pool.query(
    'select kind, node, input from public.workflow_steps where run_id = $1', [runId]);
  expect(steps.rows.some((r: { kind: string; node: string }) => r.kind === 'fallback' && r.node === 'triage')).toBe(true);
});
