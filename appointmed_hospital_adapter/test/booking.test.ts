import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeTestContext } from './helpers.js';
import { FIX, ensureFixtures } from './fixtures.js';

const ctx = makeTestContext();
beforeAll(() => ensureFixtures(ctx.pool));
afterAll(() => ctx.close());

function confirm(body: object, key = FIX.keyA) {
  return ctx.app.inject({
    method: 'POST', url: '/appointment/confirm', headers: { 'x-api-key': key }, payload: body,
  });
}

test('books an open slot: 201, pending, ext id, slot flips to booked', async () => {
  const res = await confirm({ slotId: FIX.slotOpenA1, patientName: 'Demo Patient' });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  expect(body.status).toBe('pending');
  expect(body.externalAppointmentId).toMatch(/^ext_[0-9a-f]{16}$/);
  expect(body.slot).toMatchObject({ id: FIX.slotOpenA1, specialty: 'Cardiology', price: 150 });

  const slot = await ctx.pool.query('select status from public.slots where id = $1', [FIX.slotOpenA1]);
  expect(slot.rows[0].status).toBe('booked');
  const booking = await ctx.pool.query(
    'select status, patient_name from public.hospital_bookings where external_id = $1',
    [body.externalAppointmentId],
  );
  expect(booking.rows[0]).toEqual({ status: 'pending', patient_name: 'Demo Patient' });
});

test('double-booking the same slot returns 409 slot_taken', async () => {
  const first = await confirm({ slotId: FIX.slotOpenA2, patientName: 'P1' });
  expect(first.statusCode).toBe(201);
  const second = await confirm({ slotId: FIX.slotOpenA2, patientName: 'P2' });
  expect(second.statusCode).toBe(409);
  expect(second.json()).toEqual({ error: 'slot_taken' });
});

test("another hospital's slot is invisible: 404", async () => {
  const res = await confirm({ slotId: FIX.slotOpenB, patientName: 'P' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ error: 'slot_not_found' });
});

test('unknown slot: 404', async () => {
  const res = await confirm({ slotId: '00000000-0000-4000-8000-0000000000ff', patientName: 'P' });
  expect(res.statusCode).toBe(404);
});

// Not in the brief: a malformed slotId (not even a UUID) binds straight into
// `where s.id = $1` against a uuid column and would raise a Postgres
// "invalid input syntax for type uuid" error that escapes as 500. It must be
// rejected before the query runs, using the same slot_not_found contract an
// absent-but-well-formed id gets (below).
test('malformed slotId returns 404 slot_not_found, not 500', async () => {
  const res = await confirm({ slotId: 'not-a-uuid', patientName: 'P' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ error: 'slot_not_found' });
});

test('cancel reopens the slot and fires a cancelled postback', async () => {
  const created = await confirm({ slotId: FIX.slotOpenA1, patientName: 'P' });
  // slotOpenA1 may already be booked by the earlier test in this file run - reuse its ext id if 409
  const extId = created.statusCode === 201
    ? created.json().externalAppointmentId
    : (await ctx.pool.query(
        `select external_id from public.hospital_bookings where slot_id = $1 and status = 'pending'`,
        [FIX.slotOpenA1],
      )).rows[0].external_id;

  ctx.sent.length = 0;
  const res = await ctx.app.inject({
    method: 'POST', url: '/appointment/cancel',
    headers: { 'x-api-key': FIX.keyA }, payload: { externalAppointmentId: extId },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ externalAppointmentId: extId, status: 'cancelled', postbackDelivered: true });

  const slot = await ctx.pool.query('select status from public.slots where id = $1', [FIX.slotOpenA1]);
  expect(slot.rows[0].status).toBe('open');
  expect(ctx.sent).toEqual([
    expect.objectContaining({ externalAppointmentId: extId, hospitalId: FIX.hospitalA, action: 'cancelled' }),
  ]);
});

test('cancel of unknown booking returns 404', async () => {
  const res = await ctx.app.inject({
    method: 'POST', url: '/appointment/cancel',
    headers: { 'x-api-key': FIX.keyA }, payload: { externalAppointmentId: 'ext_ffffffffffffffff' },
  });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ error: 'booking_not_found' });
});

test('a slot in the past is not bookable: 404 slot_not_found', async () => {
  const res = await confirm({ slotId: FIX.slotPastA, patientName: 'P' });
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ error: 'slot_not_found' });
});
