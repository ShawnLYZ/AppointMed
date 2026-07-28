import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeTestContext } from './helpers.js';
import { FIX, ensureFixtures } from './fixtures.js';

const ctx = makeTestContext();
beforeAll(() => ensureFixtures(ctx.pool));
afterAll(() => ctx.close());

test('GET /health responds ok', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ status: 'ok', service: 'appointmed-hospital-adapter' });
});

test('missing api key is rejected', async () => {
  const res = await ctx.app.inject({ method: 'GET', url: '/specialists' });
  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: 'missing_api_key' });
});

test('unknown api key is rejected', async () => {
  const res = await ctx.app.inject({
    method: 'GET', url: '/specialists', headers: { 'x-api-key': 'amk_nope' },
  });
  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: 'invalid_api_key' });
});

test('inactive api key is rejected', async () => {
  const res = await ctx.app.inject({
    method: 'GET', url: '/specialists', headers: { 'x-api-key': FIX.inactiveKey },
  });
  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: 'invalid_api_key' });
});

test('valid api key passes auth and bumps request_count', async () => {
  const before = await ctx.pool.query(
    'select request_count from public.hospital_api_keys where id = $1', [FIX.apiKeyIdA],
  );
  const res = await ctx.app.inject({
    method: 'GET', url: '/specialists', headers: { 'x-api-key': FIX.keyA },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().hospital).toEqual({ id: FIX.hospitalA, name: 'RLS Test Hospital A' });
  // usage accounting is fire-and-forget; give it a beat
  await new Promise((r) => setTimeout(r, 300));
  const after = await ctx.pool.query(
    'select request_count from public.hospital_api_keys where id = $1', [FIX.apiKeyIdA],
  );
  expect(Number(after.rows[0].request_count)).toBeGreaterThan(Number(before.rows[0].request_count));
});

test('key B authenticates as hospital B, not hospital A', async () => {
  const res = await ctx.app.inject({
    method: 'GET', url: '/specialists', headers: { 'x-api-key': FIX.keyB },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().hospital).toEqual({ id: FIX.hospitalB, name: 'RLS Test Hospital B' });
});
