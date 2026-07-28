import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeTestContext, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => { ctx = await makeTestContext(); });
afterAll(() => ctx.close());

test('health is public', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/health' });
  expect(res.json()).toEqual({ status: 'ok', service: 'appointmed-engine' });
});

test('consult routes require a valid bearer token', async () => {
  const noTok = await ctx.app.inject({ method: 'POST', url: '/consult/start' });
  expect(noTok.statusCode).toBe(401);
  const badTok = await ctx.app.inject({
    method: 'POST', url: '/consult/start', headers: { authorization: 'Bearer nope' },
  });
  expect(badTok.statusCode).toBe(401);
});
