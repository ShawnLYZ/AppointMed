// Single source of truth for the repo-root database scripts (db:check, db:push,
// db:seed, db:verify, test:rls).
//
// These values are NOT committed. They are read, in order, from:
//   1. an environment variable (SUPABASE_URL / SUPABASE_ANON_KEY /
//      SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL), then
//   2. `appointmed_engine/.env` — the file you fill in during README §6 Part D,
//      so the same four values serve the engine, the adapter and these scripts.
//
// If neither supplies a value, the placeholder below survives and
// assertConfigured() aborts with a message naming the file to fix.
import { existsSync } from 'node:fs';
import path from 'node:path';

const engineEnv = path.resolve(import.meta.dirname, '..', 'appointmed_engine', '.env');
if (existsSync(engineEnv)) process.loadEnvFile(engineEnv);

export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://YOUR_PROJECT_REF.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? 'YOUR_SUPABASE_ANON_KEY';

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const PLACEHOLDER_DB_URL =
  'postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-1-YOUR_REGION.pooler.supabase.com:5432/postgres';

// SUPABASE_DB_URL is the explicit one-off override (e.g. to try a different
// pooler region); DATABASE_URL is what appointmed_engine/.env supplies.
export const DB_URL =
  process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? PLACEHOLDER_DB_URL;

// Tried in order by `npm run db:check`. The second entry is the same host with
// the other Supabase pooler prefix (aws-0 / aws-1), which some projects use —
// a cheap retry that costs nothing when the first candidate already works.
export const DB_URL_CANDIDATES = [
  DB_URL,
  DB_URL.includes('@aws-1-') ? DB_URL.replace('@aws-1-', '@aws-0-') : DB_URL.replace('@aws-0-', '@aws-1-'),
].filter((u, i, all) => all.indexOf(u) === i);

/**
 * Aborts with a readable message if any value is still a `YOUR_...`
 * placeholder. Every script that touches the database calls this first.
 */
export function assertConfigured({ needsServiceRole = false, needsAnonKey = false } = {}) {
  const missing = [
    ['DATABASE_URL', DB_URL],
    ...(needsServiceRole ? [['SUPABASE_URL', SUPABASE_URL], ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY]] : []),
    ...(needsAnonKey ? [['SUPABASE_URL', SUPABASE_URL], ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY]] : []),
  ].filter(([, v]) => v.includes('YOUR_')).map(([k]) => k);

  if (!missing.length) return;
  console.error(
    `\n✗ Not configured: ${[...new Set(missing)].join(', ')} still ${missing.length > 1 ? 'hold' : 'holds'} a placeholder value.\n\n` +
    `Fix: copy appointmed_engine/.env.example to appointmed_engine/.env and paste your own\n` +
    `Supabase values into it — these scripts read that file.\n\n` +
    `Where to get the values: README.md §6 Part C (collect them) and Part D (paste them in).\n`,
  );
  process.exit(1);
}
