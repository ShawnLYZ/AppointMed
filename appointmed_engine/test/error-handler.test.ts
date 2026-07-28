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

// No throwing route is added to server.ts/a route file for this test. Instead
// this exploits a genuine, pre-existing behavior of the real /consult/:runId/message
// route: OllamaStub.structured() throws a plain Error (not OllamaUnavailableError)
// when its queue is empty (see test/stub-ollama.ts), and handleIntakeMessage
// (src/workflow/nodes/intake.ts) only catches OllamaUnavailableError - anything
// else it rethrows. By deliberately NOT enqueueing a decision, the plain Error
// escapes the route handler uncaught, which is exactly the case
// app.setErrorHandler (src/server.ts) exists to turn into a clean response.
test('an uncaught route error yields a clean 500 { error: internal_error }, never Fastify\'s default leaking shape', async () => {
  const start = await ctx.app.inject({ method: 'POST', url: '/consult/start', headers: auth() });
  expect(start.statusCode).toBe(200);
  const { runId } = start.json();

  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'hello' },
  });

  expect(res.statusCode).toBe(500);
  expect(res.json()).toEqual({ error: 'internal_error' });
  // The point of the handler: no driver/stack/message leakage - the body has
  // exactly one key, not Fastify's default { statusCode, error, message }.
  expect(Object.keys(res.json())).toEqual(['error']);
});
