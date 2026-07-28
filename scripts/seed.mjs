// Runs supabase/seed.sql (domain data) then ensures the demo auth accounts.
// Idempotent — re-run any time to refresh the rolling slot window.
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DB_URL, assertConfigured } from './config.mjs';

assertConfigured({ needsServiceRole: true });

const KL_MEDICAL_ID = '10000000-0000-4000-8000-000000000001';
const DEMO = [
  {
    email: 'patient@appointmed.demo',
    appMeta: { role: 'patient' },
    userMeta: { full_name: 'Demo Patient', phone: '+60123456789', passport: 'A12345678' },
  },
  {
    email: 'manager@appointmed.demo',
    appMeta: { role: 'hospital_manager', hospital_id: KL_MEDICAL_ID },
    userMeta: { full_name: 'Demo Manager', phone: '+60198765432' },
  },
];
const PASSWORD = 'AppointMed!2026';

const db = new pg.Client({ connectionString: DB_URL });
await db.connect();

console.log('Applying supabase/seed.sql …');
await db.query(await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const { email, appMeta, userMeta } of DEMO) {
  const existing = await db.query('select id from auth.users where email = $1', [email]);
  if (existing.rows.length > 0) {
    console.log(`Demo account exists: ${email}`);
    continue;
  }
  const { error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: appMeta,
    user_metadata: userMeta,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  console.log(`Created demo account: ${email}`);
}

const counts = await db.query(`
  select
    (select count(*) from public.hospitals)                          as hospitals,
    (select count(*) from public.specialists)                        as specialists,
    (select count(*) from public.subscriptions where status='active') as active_subs,
    (select count(*) from public.hospital_api_keys where is_active)  as api_keys,
    (select count(*) from public.slots where status='open')          as open_slots
`);
console.table(counts.rows);
console.log(`Demo credentials — patient@appointmed.demo / ${PASSWORD} · manager@appointmed.demo / ${PASSWORD}`);
await db.end();
