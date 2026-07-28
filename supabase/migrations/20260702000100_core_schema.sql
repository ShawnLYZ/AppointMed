-- AppointMed core schema.
-- Ported from the v1 Flutter models (hospital/specialist/slot/appointment/user)
-- plus the PRD's workflow-engine tables. All writes go through the Node
-- services (service role); clients read under RLS added in 20260702000300.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── hospitals ──────────────────────────────────────────────────────────────
create table public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  working_hours jsonb not null default '{}'::jsonb,
  country text not null default 'Malaysia',
  default_language text not null default 'en-MY',
  postback_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_hospitals_updated before update on public.hospitals
  for each row execute function public.set_updated_at();

-- ── profiles (1:1 with auth.users) ─────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'patient' check (role in ('patient','hospital_manager')),
  full_name text not null default '',
  passport text not null default '',
  phone text not null default '',
  email text not null default '',
  avatar_url text,
  hospital_id uuid references public.hospitals(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_requires_hospital
    check (role <> 'hospital_manager' or hospital_id is not null)
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── subscriptions ───────────────────────────────────────────────────────────
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  plan text not null check (plan in ('starter','growth','enterprise')),
  status text not null default 'active' check (status in ('active','cancelled')),
  monthly_price_rm numeric(10,2) not null,
  booking_fee_pct numeric(5,2) not null default 3,
  max_specialists integer, -- null = unlimited (enterprise)
  started_at timestamptz not null default now(),
  renews_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_subscriptions_hospital on public.subscriptions(hospital_id);
create trigger trg_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ── hospital_api_keys ───────────────────────────────────────────────────────
create table public.hospital_api_keys (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  api_key text not null unique,
  label text not null default 'Default key',
  is_active boolean not null default true,
  request_count bigint not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_api_keys_hospital on public.hospital_api_keys(hospital_id);

-- ── specialists ─────────────────────────────────────────────────────────────
create table public.specialists (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  full_name text not null,
  specialty text not null,
  price numeric(10,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_specialists_hospital on public.specialists(hospital_id);
create index idx_specialists_specialty on public.specialists(specialty) where is_active;
create trigger trg_specialists_updated before update on public.specialists
  for each row execute function public.set_updated_at();

-- ── slots ───────────────────────────────────────────────────────────────────
create table public.slots (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  specialist_id uuid not null references public.specialists(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price numeric(10,2) not null,
  status text not null default 'open' check (status in ('open','booked')),
  created_at timestamptz not null default now()
);
create index idx_slots_specialist_time on public.slots(specialist_id, starts_at);
create index idx_slots_open on public.slots(starts_at) where status = 'open';

-- ── workflow_runs (engine state machine instances) ──────────────────────────
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','waiting_hospital','completed','failed','escalated')),
  current_node text not null default 'intake'
    check (current_node in ('intake','triage','match','book_request','hospital_review','postback','done')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_runs_user on public.workflow_runs(user_id, created_at desc);
create trigger trg_runs_updated before update on public.workflow_runs
  for each row execute function public.set_updated_at();

-- ── workflow_steps (audit log of every node/decision/tool call) ─────────────
create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  seq integer not null,
  node text not null,
  kind text not null check (kind in ('llm_decision','tool_call','transition','error','fallback')),
  input jsonb,
  output jsonb,
  model text,
  latency_ms integer,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);
create index idx_steps_run on public.workflow_steps(run_id, seq);

-- ── appointments ────────────────────────────────────────────────────────────
-- Denormalized display names are intentional: clients render lists and the
-- requests queue straight from this row (SELECT-only under RLS, no joins).
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_name text not null default '',
  hospital_id uuid not null references public.hospitals(id),
  hospital_name text not null default '',
  specialist_id uuid references public.specialists(id),
  specialist_name text not null default '',
  specialty text not null default '',
  slot_id uuid references public.slots(id) on delete set null,
  external_slot_id text not null default '',
  external_appointment_id text not null default '',
  run_id uuid references public.workflow_runs(id),
  starts_at timestamptz not null,
  proposed_starts_at timestamptz,
  price numeric(10,2),
  status text not null default 'pending'
    check (status in ('pending','confirmed','reschedule_proposed','declined','cancelled','completed')),
  status_source text not null default 'appointmed'
    check (status_source in ('appointmed','hospital_postback')),
  created_via_ai boolean not null default false,
  ai_summary text,
  suggested_priority text check (suggested_priority in ('low','medium','high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_appointments_user on public.appointments(user_id, starts_at desc);
create index idx_appointments_hospital on public.appointments(hospital_id, status, created_at desc);
create trigger trg_appointments_updated before update on public.appointments
  for each row execute function public.set_updated_at();

-- ── ai_chats (saved consultations) ──────────────────────────────────────────
create table public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.workflow_runs(id),
  messages jsonb not null default '[]'::jsonb,
  verdict text,
  recommended_specialty text,
  appointment_created boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ai_chats_user on public.ai_chats(user_id, created_at desc);
create trigger trg_ai_chats_updated before update on public.ai_chats
  for each row execute function public.set_updated_at();

-- ── notifications (in-app, delivered via Realtime) ──────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'general',
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on public.notifications(user_id, created_at desc);

-- ── realtime ────────────────────────────────────────────────────────────────
-- Clients subscribe to their own appointments + notifications; RLS (added in
-- 20260702000300) is enforced for postgres_changes. Full replica identity so
-- update events carry complete rows.
alter table public.appointments replica identity full;
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.appointments, public.notifications;
