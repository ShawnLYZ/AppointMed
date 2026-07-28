// Idempotent adapter test fixtures against the hosted DB.
// Hospital/key UUIDs mirror supabase/tests/helpers.mjs (source of truth) -
// duplicated because this service is standalone by design.
import type { Pool } from 'pg';

export const FIX = {
  hospitalA: 'f0000000-0000-4000-8000-000000000001',
  hospitalB: 'f0000000-0000-4000-8000-000000000002',
  keyA: 'amk_rlstest_aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  keyB: 'amk_rlstest_bbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  apiKeyIdA: 'f0000000-0000-4000-8000-0000000000a1',
  apiKeyIdB: 'f0000000-0000-4000-8000-0000000000b1',
  inactiveKey: 'amk_rlstest_cccccccccccccccccccccccccccc',
  inactiveKeyId: 'c0000000-0000-4000-8000-0000000000c1',
  spCardioA: 'c0000000-0000-4000-8000-000000000001',
  spInactiveA: 'c0000000-0000-4000-8000-000000000002',
  spCardioB: 'c0000000-0000-4000-8000-000000000003',
  slotOpenA1: 'c1000000-0000-4000-8000-000000000001', // +2d 09:00, RM150
  slotOpenA2: 'c1000000-0000-4000-8000-000000000002', // +3d 14:00, RM150
  slotBookedA: 'c1000000-0000-4000-8000-000000000003', // +2d 10:00, pre-booked
  slotOpenB: 'c1000000-0000-4000-8000-000000000004', // hospital B, +2d 09:00
  slotPriceyA: 'c1000000-0000-4000-8000-000000000005', // +2d 11:00, RM999
  slotPastA: 'c1000000-0000-4000-8000-000000000006', // -1d, must never appear
  slotInactiveSpA: 'c1000000-0000-4000-8000-000000000007', // inactive specialist
};

export async function ensureFixtures(pool: Pool): Promise<void> {
  await pool.query(
    `insert into public.hospitals (id, name, address) values
       ($1, 'RLS Test Hospital A', '1 Test Street'),
       ($2, 'RLS Test Hospital B', '2 Test Street')
     on conflict (id) do nothing`,
    [FIX.hospitalA, FIX.hospitalB],
  );
  await pool.query(
    `insert into public.hospital_api_keys (id, hospital_id, api_key, label, is_active) values
       ($1, $2, $3, 'rls-test', true),
       ($4, $5, $6, 'rls-test', true),
       ($7, $8, $9, 'adapter-test-inactive', false)
     on conflict (id) do nothing`,
    [
      FIX.apiKeyIdA, FIX.hospitalA, FIX.keyA,
      FIX.apiKeyIdB, FIX.hospitalB, FIX.keyB,
      FIX.inactiveKeyId, FIX.hospitalA, FIX.inactiveKey,
    ],
  );
  await pool.query(
    `insert into public.specialists (id, hospital_id, full_name, specialty, price, is_active) values
       ($1, $2, 'Dr. Adapter Cardio A', 'Cardiology', 150.00, true),
       ($3, $4, 'Dr. Adapter Inactive', 'Cardiology', 150.00, false),
       ($5, $6, 'Dr. Adapter Cardio B', 'Cardiology', 150.00, true)
     on conflict (id) do update set is_active = excluded.is_active`,
    [FIX.spCardioA, FIX.hospitalA, FIX.spInactiveA, FIX.hospitalA, FIX.spCardioB, FIX.hospitalB],
  );

  // Slots are delete+reinsert so status/time are deterministic on every run.
  await pool.query(`delete from public.hospital_bookings where hospital_id in ($1, $2)`, [
    FIX.hospitalA, FIX.hospitalB,
  ]);
  await pool.query(`delete from public.slots where id = any($1::uuid[])`, [Object.values(FIX).filter((v) => v.startsWith('c1'))]);
  await pool.query(
    `insert into public.slots (id, hospital_id, specialist_id, starts_at, ends_at, price, status) values
       ($1,  $8, $11, now() + interval '2 days' + interval '9 hours',  now() + interval '2 days' + interval '9.5 hours',  150.00, 'open'),
       ($2,  $8, $11, now() + interval '3 days' + interval '14 hours', now() + interval '3 days' + interval '14.5 hours', 150.00, 'open'),
       ($3,  $8, $11, now() + interval '2 days' + interval '10 hours', now() + interval '2 days' + interval '10.5 hours', 150.00, 'booked'),
       ($4,  $9, $12, now() + interval '2 days' + interval '9 hours',  now() + interval '2 days' + interval '9.5 hours',  150.00, 'open'),
       ($5,  $8, $11, now() + interval '2 days' + interval '11 hours', now() + interval '2 days' + interval '11.5 hours', 999.00, 'open'),
       ($6,  $8, $11, now() - interval '1 day',                        now() - interval '1 day' + interval '30 minutes',  150.00, 'open'),
       ($7,  $8, $10, now() + interval '2 days' + interval '9 hours',  now() + interval '2 days' + interval '9.5 hours',  150.00, 'open')`,
    [
      FIX.slotOpenA1, FIX.slotOpenA2, FIX.slotBookedA, FIX.slotOpenB,
      FIX.slotPriceyA, FIX.slotPastA, FIX.slotInactiveSpA,
      FIX.hospitalA, FIX.hospitalB, FIX.spInactiveA, FIX.spCardioA, FIX.spCardioB,
    ],
  );
}
