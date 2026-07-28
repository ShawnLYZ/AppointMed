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

test('start creates an intake run with the greeting', async () => {
  const body = await start();
  expect(body.node).toBe('intake');
  expect(body.status).toBe('active');
  expect(body.reply).toContain('AppointMed');
  const run = await ctx.pool.query('select * from public.workflow_runs where id = $1', [body.runId]);
  expect(run.rows[0].current_node).toBe('intake');
});

test('incomplete intake asks a follow-up and merges fields', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue({
    reply: 'How long has the headache been going on, and how bad is it from 1-10?',
    complete: false, redFlag: false,
    fields: { mainComplaint: 'headache', duration: null, severity: null,
      associatedSymptoms: null, medicalHistory: null, currentMedications: null },
  });
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'I have a headache' },
  });
  const body = res.json();
  expect(body.node).toBe('intake');
  expect(body.reply).toContain('1-10');
  const run = await ctx.pool.query('select state from public.workflow_runs where id = $1', [runId]);
  expect(run.rows[0].state.symptoms.mainComplaint).toBe('headache');
  // llm_decision step logged
  const steps = await ctx.pool.query(
    `select kind from public.workflow_steps where run_id = $1 order by seq`, [runId]);
  expect(steps.rows.map((r: { kind: string }) => r.kind)).toContain('llm_decision');
});

test('red flag escalates deterministically', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue({
    reply: 'This sounds serious.', complete: false, redFlag: true, redFlagReason: 'chest pain with breathlessness',
    fields: { mainComplaint: 'chest pain', duration: null, severity: null,
      associatedSymptoms: 'shortness of breath', medicalHistory: null, currentMedications: null },
  });
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(),
    payload: { text: 'crushing chest pain and I cannot breathe' },
  });
  const body = res.json();
  expect(body.escalated).toBe(true);
  expect(body.status).toBe('escalated');
  expect(body.reply).toContain('999');
});

test('ollama outage during intake degrades gracefully, run stays alive', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue(new Error('down'));
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'hello' },
  });
  const body = res.json();
  expect(res.statusCode).toBe(200);
  expect(body.node).toBe('intake');
  expect(body.reply.toLowerCase()).toContain('trouble');
  const steps = await ctx.pool.query(
    `select kind from public.workflow_steps where run_id = $1`, [runId]);
  expect(steps.rows.map((r: { kind: string }) => r.kind)).toContain('fallback');
});

test("foreign run id → 404", async () => {
  const res = await ctx.app.inject({
    method: 'GET', url: '/consult/00000000-0000-4000-8000-0000000000aa', headers: auth(),
  });
  expect(res.statusCode).toBe(404);
});

test('an escalated run seals further messages to a fixed emergency reply (no LLM call)', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue({
    reply: 'This sounds serious.', complete: false, redFlag: true, redFlagReason: 'severe chest pain',
    fields: { mainComplaint: 'chest pain', duration: null, severity: null,
      associatedSymptoms: null, medicalHistory: null, currentMedications: null },
  });
  await ctx.app.inject({ method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'severe chest pain' } });
  const callsBefore = ctx.ollama.calls.length;
  const res = await ctx.app.inject({ method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'is it ok now?' } });
  const body = res.json();
  expect(res.statusCode).toBe(200);
  expect(body.status).toBe('escalated');
  expect(body.reply).toContain('999');
  expect(ctx.ollama.calls.length).toBe(callsBefore); // sealed follow-up made NO new LLM call
});
