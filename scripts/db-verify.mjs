// Reports schema state: tables, buckets, auth trigger. Exits 1 if any of the
// 12 core tables is missing (buckets/trigger are informational here — they
// arrive with migration 20260702000200).
import pg from 'pg';
import { DB_URL, assertConfigured } from './config.mjs';

assertConfigured();

const EXPECTED_TABLES = [
  'ai_chats', 'appointments', 'hospital_api_keys', 'hospital_bookings', 'hospitals',
  'notifications', 'profiles', 'slots', 'specialists', 'subscriptions',
  'workflow_runs', 'workflow_steps',
];

const c = new pg.Client({ connectionString: DB_URL });
await c.connect();
const tables = (await c.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by 1",
)).rows.map((r) => r.table_name);
const missing = EXPECTED_TABLES.filter((t) => !tables.includes(t));
const buckets = (await c.query('select id from storage.buckets order by 1')).rows.map((r) => r.id);
const trigger =
  (await c.query("select 1 from pg_trigger where tgname = 'on_auth_user_created'")).rows.length === 1;
await c.end();

console.log(
  `tables:  ${EXPECTED_TABLES.length - missing.length}/${EXPECTED_TABLES.length}` +
    (missing.length ? ` missing: ${missing.join(', ')}` : ''),
);
console.log(`buckets: ${buckets.length}/2 ${buckets.join(', ')}`);
console.log(`trigger on_auth_user_created: ${trigger ? 'present' : 'MISSING'}`);
process.exit(missing.length ? 1 : 0);
