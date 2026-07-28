import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeTestContext } from './helpers.js';
import { FIX, ensureFixtures } from './fixtures.js';

const ctx = makeTestContext();
beforeAll(() => ensureFixtures(ctx.pool));
afterAll(() => ctx.close());

async function makePendingBooking(slotId: string): Promise<string> {
  // Decision tests exercise the decision endpoint, not slot contention
  // (booking.test.ts owns that) - start each from a known-open slot so the
  // file is order-independent regardless of what a prior test left booked.
  await ctx.pool.query(`update public.slots set status = 'open' where id = $1`, [slotId]);
  const res = await ctx.app.inject({
    method: 'POST', url: '/appointment/confirm',
    headers: { 'x-api-key': FIX.keyA }, payload: { slotId, patientName: 'P' },
  });
  expect(res.statusCode).toBe(201);
  return res.json().externalAppointmentId;
}

function decide(payload: object, key = FIX.keyA) {
  return ctx.app.inject({
    method: 'POST', url: '/appointment/decision', headers: { 'x-api-key': key }, payload,
  });
}

test('confirm decision: booking confirmed + postback', async () => {
  const extId = await makePendingBooking(FIX.slotOpenA1);
  ctx.sent.length = 0;
  const res = await decide({ externalAppointmentId: extId, decision: 'confirm' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ externalAppointmentId: extId, status: 'confirmed', postbackDelivered: true });
  expect(ctx.sent).toEqual([
    expect.objectContaining({ externalAppointmentId: extId, action: 'confirmed', hospitalId: FIX.hospitalA }),
  ]);
});

test('decline decision: slot reopens + postback', async () => {
  const extId = await makePendingBooking(FIX.slotOpenA2);
  ctx.sent.length = 0;
  const res = await decide({ externalAppointmentId: extId, decision: 'decline' });
  expect(res.json()).toMatchObject({ status: 'declined' });
  const slot = await ctx.pool.query('select status from public.slots where id = $1', [FIX.slotOpenA2]);
  expect(slot.rows[0].status).toBe('open');
  expect(ctx.sent[0]).toMatchObject({ action: 'declined' });
});

test('reschedule requires proposedStartsAt and forwards it', async () => {
  const extId = await makePendingBooking(FIX.slotPriceyA);
  const missing = await decide({ externalAppointmentId: extId, decision: 'reschedule' });
  expect(missing.statusCode).toBe(400);
  expect(missing.json()).toEqual({ error: 'proposed_time_required' });

  ctx.sent.length = 0;
  const proposed = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
  const res = await decide({ externalAppointmentId: extId, decision: 'reschedule', proposedStartsAt: proposed });
  expect(res.json()).toMatchObject({ status: 'rescheduled' });
  expect(ctx.sent[0]).toMatchObject({ action: 'rescheduled', proposedStartsAt: proposed });
  const row = await ctx.pool.query(
    'select proposed_starts_at from public.hospital_bookings where external_id = $1', [extId],
  );
  expect(row.rows[0].proposed_starts_at.toISOString()).toBe(proposed);
});

test('postback failure is reported, decision still succeeds', async () => {
  const extId = await makePendingBooking(FIX.slotOpenA1);
  ctx.postback.mockResolvedValueOnce(false);
  const res = await decide({ externalAppointmentId: extId, decision: 'confirm' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ postbackDelivered: false });
  const row = await ctx.pool.query(
    'select postback_delivered, postback_attempts from public.hospital_bookings where external_id = $1',
    [extId],
  );
  expect(row.rows[0].postback_delivered).toBe(false);
  expect(row.rows[0].postback_attempts).toBeGreaterThan(0);
});

test('unknown booking: 404; foreign hospital booking: 404', async () => {
  const unknown = await decide({ externalAppointmentId: 'ext_0000000000000000', decision: 'confirm' });
  expect(unknown.statusCode).toBe(404);
  const extId = await makePendingBooking(FIX.slotOpenA2); // A's booking
  const foreign = await decide({ externalAppointmentId: extId, decision: 'confirm' }, FIX.keyB);
  expect(foreign.statusCode).toBe(404);
});

test('malformed proposedStartsAt is rejected 400, never reaches the timestamptz cast', async () => {
  const extId = await makePendingBooking(FIX.slotPriceyA);
  const res = await decide({ externalAppointmentId: extId, decision: 'reschedule', proposedStartsAt: 'not-a-date' });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: 'proposed_time_required' });
});

test('a decided booking cannot be decided again: 409, slot state intact', async () => {
  const extId = await makePendingBooking(FIX.slotOpenA1);
  const first = await decide({ externalAppointmentId: extId, decision: 'confirm' });
  expect(first.statusCode).toBe(200);

  const second = await decide({ externalAppointmentId: extId, decision: 'decline' });
  expect(second.statusCode).toBe(409);
  expect(second.json()).toEqual({ error: 'already_decided' });

  // the re-decide must not have reopened the slot or changed the booking
  const slot = await ctx.pool.query('select status from public.slots where id = $1', [FIX.slotOpenA1]);
  expect(slot.rows[0].status).toBe('booked');
  const booking = await ctx.pool.query(
    'select status from public.hospital_bookings where external_id = $1', [extId],
  );
  expect(booking.rows[0].status).toBe('confirmed');
});
