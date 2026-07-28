import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeTestContext, type TestContext } from './helpers.js';
import { appendMessages, createRun, getRun, getSteps, getTranscript, logStep, saveRun } from '../src/workflow/runs.js';
import { insertNotification } from '../src/tools/notify.js';

let ctx: TestContext;
beforeAll(async () => { ctx = await makeTestContext(); });
afterAll(async () => {
  await ctx.pool.query('delete from public.ai_chats where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.notifications where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.workflow_runs where user_id = $1', [ctx.userId]); // workflow_steps cascade
  await ctx.close();
});

test('createRun starts an active intake run; saveRun/getRun roundtrips mutated state', async () => {
  const run = await createRun(ctx.pool, ctx.userId);
  expect(run.userId).toBe(ctx.userId);
  expect(run.status).toBe('active');
  expect(run.node).toBe('intake');
  expect(run.state.symptoms.mainComplaint).toBeNull();

  run.state.symptoms.mainComplaint = 'persistent headache';
  run.status = 'waiting_hospital';
  run.node = 'triage';
  await saveRun(ctx.pool, run);

  const reloaded = await getRun(ctx.pool, run.id);
  if (!reloaded) throw new Error('expected getRun to find the saved run');
  expect(reloaded.status).toBe('waiting_hospital');
  expect(reloaded.node).toBe('triage');
  expect(reloaded.state.symptoms.mainComplaint).toBe('persistent headache');
});

test('logStep assigns sequential seq numbers per run', async () => {
  const run = await createRun(ctx.pool, ctx.userId);
  await logStep(ctx.pool, run.id, 'intake', 'llm_decision', { turn: 1 }, { reply: 'hi' }, 'gemma4:12b', 250);
  await logStep(ctx.pool, run.id, 'intake', 'transition', null, { to: 'triage' });
  await logStep(ctx.pool, run.id, 'triage', 'tool_call', { specialty: 'Cardiology' }, { ok: true });

  const steps = await getSteps(ctx.pool, run.id);
  expect(steps.map((s) => s.seq)).toEqual([1, 2, 3]);
  expect(steps.map((s) => s.node)).toEqual(['intake', 'intake', 'triage']);
  expect(steps[0].kind).toBe('llm_decision');
  expect(steps[0].input).toEqual({ turn: 1 });
  expect(steps[0].output).toEqual({ reply: 'hi' });
  expect(steps[0].model).toBe('gemma4:12b');
  expect(steps[0].latency_ms).toBe(250);
  expect(steps[1].model).toBeNull();
  expect(steps[1].latency_ms).toBeNull();
});

test('appendMessages then getTranscript roundtrips role and content', async () => {
  const run = await createRun(ctx.pool, ctx.userId);
  expect(await getTranscript(ctx.pool, run.id)).toEqual([]);

  await appendMessages(ctx.pool, run.id, [{ role: 'user', content: 'I have a headache' }]);
  await appendMessages(ctx.pool, run.id, [{ role: 'assistant', content: 'How long has it lasted?' }]);

  const transcript = await getTranscript(ctx.pool, run.id);
  expect(transcript).toHaveLength(2);
  expect(transcript[0]).toMatchObject({ role: 'user', content: 'I have a headache' });
  expect(transcript[1]).toMatchObject({ role: 'assistant', content: 'How long has it lasted?' });
});

test('insertNotification writes a row that can be queried back', async () => {
  await insertNotification(
    ctx.pool, ctx.userId, 'appointment_booked', 'Appointment booked',
    'Your appointment has been confirmed.', { runId: 'test-run-123' },
  );

  const { rows } = await ctx.pool.query(
    `select type, title, body, data from public.notifications where user_id = $1 and title = $2`,
    [ctx.userId, 'Appointment booked'],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].type).toBe('appointment_booked');
  expect(rows[0].body).toBe('Your appointment has been confirmed.');
  expect(rows[0].data).toEqual({ runId: 'test-run-123' });
});
