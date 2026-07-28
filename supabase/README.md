# AppointMed Database (Supabase)

Runs against **your own** hosted Supabase project — this repository ships no credentials.

Every value the scripts below need comes from `appointmed_engine/.env`, which you create by
copying `appointmed_engine/.env.example` and pasting in your project's Project URL, anon key,
service-role key and Session pooler connection string. README.md §6 Part C explains where to
find each one; Part D explains what to paste where. Any script run before that fails with a
message naming the file to fix.

## Commands (repo root)

| Command | What it does |
|---|---|
| `npm run db:check` | Probes DB connectivity (direct + pooler candidates) |
| `npm run db:push` | Applies `supabase/migrations/*.sql` to the hosted DB |
| `npm run db:seed` | Applies `supabase/seed.sql` + ensures demo accounts; re-run to refresh rolling slots |
| `npm run test:rls` | RLS isolation suite (`node --test supabase/tests/`) |

`DATABASE_URL` in `appointmed_engine/.env` must be the **Session pooler** string, not
"Direct connection" — the direct host is IPv6-only and is `ENOTFOUND` on many networks.
To try a different URL without editing the file, set `SUPABASE_DB_URL`, which wins over it:
`$env:SUPABASE_DB_URL = "postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-1-YOUR_REGION.pooler.supabase.com:5432/postgres"`
(get the exact region from Dashboard → Connect → Session pooler; URL-encode the password, `@` → `%40`).

## One-time project settings

- **Authentication → Sign In / Providers → Email → disable "Confirm email"** — required so
  self-registration (mobile patients, hospital subscription) activates instantly.

## Demo data

- 6 hospitals (fixed UUIDs `10000000-…-00000000000{1..6}`), 20 specialists, mixed
  subscription tiers, one API key per hospital (`amk_demo_…`, see `seed.sql`).
- Rolling slots: next 7 days, 09/10/11/14/15/16 Kuala Lumpur time, Sundays skipped.
- Demo accounts: `patient@appointmed.demo` / `AppointMed!2026` and
  `manager@appointmed.demo` / `AppointMed!2026` (manager → KL Medical Center).

## Access model

Clients (mobile/web) hold only the **anon key** — the public one, safe to compile into an app:
SELECT under least-privilege RLS
(patients see their own rows; managers see their hospital's), plus exactly two
owner-updates — `profiles(full_name, passport, phone, avatar_url)` and
`notifications(read_at)`. **All other writes** go through the Node services
(engine/adapter), which alone hold the service-role key. `workflow_runs` /
`workflow_steps` have no client policies at all. New auth users get a `profiles`
row via the `handle_new_user` trigger; `role`/`hospital_id` are read from
`app_metadata` (service-role only), so self-signups cannot escalate.
