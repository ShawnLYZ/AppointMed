import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeTestContext } from './helpers.js';
import { FIX, ensureFixtures } from './fixtures.js';

const ctx = makeTestContext();
beforeAll(() => ensureFixtures(ctx.pool));
afterAll(() => ctx.close());

function get(url: string, key = FIX.keyA) {
  return ctx.app.inject({ method: 'GET', url, headers: { 'x-api-key': key } });
}

test('default window returns own open future slots, ordered, excluding booked/past/inactive/foreign', async () => {
  const res = await get('/slots?specialty=Cardiology');
  expect(res.statusCode).toBe(200);
  const ids = res.json().slots.map((s: { id: string }) => s.id);
  expect(ids).toEqual([FIX.slotOpenA1, FIX.slotPriceyA, FIX.slotOpenA2]); // time order
  expect(ids).not.toContain(FIX.slotBookedA);
  expect(ids).not.toContain(FIX.slotPastA);
  expect(ids).not.toContain(FIX.slotInactiveSpA);
  expect(ids).not.toContain(FIX.slotOpenB);
});

test('maxPrice filters expensive slots', async () => {
  const res = await get('/slots?specialty=Cardiology&maxPrice=200');
  const ids = res.json().slots.map((s: { id: string }) => s.id);
  expect(ids).toEqual([FIX.slotOpenA1, FIX.slotOpenA2]);
});

test('specialty filter is case-insensitive and misses return empty', async () => {
  const res = await get('/slots?specialty=cardiology');
  expect(res.json().slots.length).toBeGreaterThan(0);
  const none = await get('/slots?specialty=Dermatology');
  expect(none.json().slots).toEqual([]);
});

test('from/to narrow the window', async () => {
  const from = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString(); // +2.5d
  const res = await get(`/slots?specialty=Cardiology&from=${encodeURIComponent(from)}`);
  const ids = res.json().slots.map((s: { id: string }) => s.id);
  expect(ids).toEqual([FIX.slotOpenA2]);
});

test('to narrows the window', async () => {
  const to = new Date(Date.now() + 60 * 60 * 60 * 1000).toISOString(); // +2.5d
  const res = await get(`/slots?specialty=Cardiology&to=${encodeURIComponent(to)}`);
  const ids = res.json().slots.map((s: { id: string }) => s.id);
  expect(ids).toEqual([FIX.slotOpenA1, FIX.slotPriceyA]); // both before the +2.5d cutoff, time order
});

test('limit caps the result set', async () => {
  const res = await get('/slots?specialty=Cardiology&limit=1');
  const ids = res.json().slots.map((s: { id: string }) => s.id);
  expect(ids).toEqual([FIX.slotOpenA1]); // earliest by starts_at
});

test.each([
  ['non-numeric limit', '/slots?limit=abc'],
  ['negative limit', '/slots?limit=-1'],
  ['non-numeric maxPrice', '/slots?maxPrice=abc'],
  ['unparseable from date', '/slots?from=notadate'],
  ['repeated param arrives as an array', '/slots?limit=1&limit=2'],
])('rejects malformed query - %s', async (_label, url) => {
  const res = await get(url);
  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: 'invalid_query' });
});

test('an explicit past `from` cannot surface past slots', async () => {
  const past = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const res = await get(`/slots?specialty=Cardiology&from=${encodeURIComponent(past)}`);
  expect(res.statusCode).toBe(200);
  const ids = res.json().slots.map((s: { id: string }) => s.id);
  expect(ids).not.toContain(FIX.slotPastA);
  expect(ids).toContain(FIX.slotOpenA1); // future slots still returned
});

test('slot payload shape is complete', async () => {
  const res = await get('/slots?specialty=Cardiology&maxPrice=200');
  const slot = res.json().slots[0];
  expect(slot).toMatchObject({
    id: FIX.slotOpenA1,
    specialistId: FIX.spCardioA,
    specialistName: 'Dr. Adapter Cardio A',
    specialty: 'Cardiology',
    price: 150,
    hospitalId: FIX.hospitalA,
    hospitalName: 'RLS Test Hospital A',
    hospitalAddress: '1 Test Street',
  });
  expect(new Date(slot.startsAt).getTime()).toBeGreaterThan(Date.now());
  expect(new Date(slot.endsAt).getTime()).toBeGreaterThan(new Date(slot.startsAt).getTime());
});
