import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeTestContext } from './helpers.js';
import { FIX, ensureFixtures } from './fixtures.js';

const ctx = makeTestContext();
beforeAll(() => ensureFixtures(ctx.pool));
afterAll(() => ctx.close());

test('returns only own hospital active specialists with camelCase shape', async () => {
  const res = await ctx.app.inject({
    method: 'GET', url: '/specialists', headers: { 'x-api-key': FIX.keyA },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.hospital).toEqual({ id: FIX.hospitalA, name: 'RLS Test Hospital A' });
  const ids = body.specialists.map((s: { id: string }) => s.id);
  expect(ids).toContain(FIX.spCardioA);
  expect(ids).not.toContain(FIX.spInactiveA); // inactive filtered
  expect(ids).not.toContain(FIX.spCardioB); // other hospital filtered
  const sp = body.specialists.find((s: { id: string }) => s.id === FIX.spCardioA);
  expect(sp).toMatchObject({
    fullName: 'Dr. Adapter Cardio A',
    specialty: 'Cardiology',
    price: 150,
    isActive: true,
  });
  expect(typeof sp.price).toBe('number');
});
