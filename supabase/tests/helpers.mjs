// Fixtures + clients for the RLS isolation suite. Self-contained: creates its
// own hospitals/users so the suite never depends on the demo seed.
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  DB_URL,
  assertConfigured,
} from '../../scripts/config.mjs';

assertConfigured({ needsServiceRole: true, needsAnonKey: true });

export const TEST = {
  password: 'RlsTest!2026',
  hospitalA: 'f0000000-0000-4000-8000-000000000001',
  hospitalB: 'f0000000-0000-4000-8000-000000000002',
  apiKeyA: 'f0000000-0000-4000-8000-0000000000a1',
  apiKeyB: 'f0000000-0000-4000-8000-0000000000b1',
  subA: 'f0000000-0000-4000-8000-00000000005a',
  subB: 'f0000000-0000-4000-8000-00000000005b',
  appointmentA: 'e0000000-0000-4000-8000-000000000001',
  notificationA: 'e0000000-0000-4000-8000-000000000002',
  chatA: 'e0000000-0000-4000-8000-000000000003',
  patientA: 'rls-patient-a@test.appointmed.demo',
  patientB: 'rls-patient-b@test.appointmed.demo',
  managerX: 'rls-manager-x@test.appointmed.demo', // hospital A
  managerY: 'rls-manager-y@test.appointmed.demo', // hospital B
};

export function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function signedInClient(email, password = TEST.password) {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

export async function pgClient() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

async function ensureUser(admin, db, email, appMeta, userMeta) {
  const existing = await db.query('select id from auth.users where email = $1', [email]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST.password,
    email_confirm: true,
    app_metadata: appMeta,
    user_metadata: userMeta,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

export async function ensureFixtures() {
  const admin = adminClient();
  const db = await pgClient();
  try {
    await db.query(
      `insert into public.hospitals (id, name, address) values
         ($1, 'RLS Test Hospital A', '1 Test Street'),
         ($2, 'RLS Test Hospital B', '2 Test Street')
       on conflict (id) do nothing`,
      [TEST.hospitalA, TEST.hospitalB],
    );
    await db.query(
      `insert into public.subscriptions (id, hospital_id, plan, monthly_price_rm, max_specialists, renews_at) values
         ($1, $2, 'starter', 500, 5, now() + interval '1 month'),
         ($3, $4, 'starter', 500, 5, now() + interval '1 month')
       on conflict (id) do nothing`,
      [TEST.subA, TEST.hospitalA, TEST.subB, TEST.hospitalB],
    );
    await db.query(
      `insert into public.hospital_api_keys (id, hospital_id, api_key, label) values
         ($1, $2, 'amk_rlstest_aaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'rls-test'),
         ($3, $4, 'amk_rlstest_bbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'rls-test')
       on conflict (id) do nothing`,
      [TEST.apiKeyA, TEST.hospitalA, TEST.apiKeyB, TEST.hospitalB],
    );

    const patientAId = await ensureUser(admin, db, TEST.patientA, { role: 'patient' }, { full_name: 'RLS Patient A' });
    await ensureUser(admin, db, TEST.patientB, { role: 'patient' }, { full_name: 'RLS Patient B' });
    await ensureUser(admin, db, TEST.managerX, { role: 'hospital_manager', hospital_id: TEST.hospitalA }, { full_name: 'RLS Manager X' });
    await ensureUser(admin, db, TEST.managerY, { role: 'hospital_manager', hospital_id: TEST.hospitalB }, { full_name: 'RLS Manager Y' });

    await db.query(
      `insert into public.appointments
         (id, user_id, patient_name, hospital_id, hospital_name, specialty, starts_at, status, created_via_ai)
       values ($1, $2, 'RLS Patient A', $3, 'RLS Test Hospital A', 'Cardiology', now() + interval '3 days', 'pending', true)
       on conflict (id) do nothing`,
      [TEST.appointmentA, patientAId, TEST.hospitalA],
    );
    await db.query(
      `insert into public.notifications (id, user_id, type, title, body)
       values ($1, $2, 'booking_update', 'Test notification', 'RLS fixture')
       on conflict (id) do nothing`,
      [TEST.notificationA, patientAId],
    );
    await db.query(
      `insert into public.ai_chats (id, user_id, messages, verdict, recommended_specialty)
       values ($1, $2, '[]'::jsonb, 'test verdict', 'Cardiology')
       on conflict (id) do nothing`,
      [TEST.chatA, patientAId],
    );
    return { patientAId };
  } finally {
    await db.end();
  }
}

// Deletes a user created during a test (by email), ignoring absence.
export async function cleanupSignupUser(email) {
  const admin = adminClient();
  const db = await pgClient();
  try {
    const { rows } = await db.query('select id from auth.users where email = $1', [email]);
    if (rows.length > 0) await admin.auth.admin.deleteUser(rows[0].id);
  } finally {
    await db.end();
  }
}
