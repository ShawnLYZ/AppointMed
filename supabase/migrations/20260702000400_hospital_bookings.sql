-- Hospital-side booking ledger. This is "the hospital's own system" state,
-- written only by the adapter (postgres role). The platform's `appointments`
-- table (engine-owned) references these rows via external_appointment_id.
create table public.hospital_bookings (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  slot_id uuid references public.slots(id) on delete set null,
  external_id text not null unique,
  patient_name text not null default '',
  note text,
  status text not null default 'pending'
    check (status in ('pending','confirmed','declined','rescheduled','cancelled')),
  proposed_starts_at timestamptz,
  postback_delivered boolean not null default false,
  postback_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_hospital_bookings_hospital on public.hospital_bookings(hospital_id, status);
create trigger trg_hospital_bookings_updated before update on public.hospital_bookings
  for each row execute function public.set_updated_at();

-- Internal system table: RLS on, zero client policies.
alter table public.hospital_bookings enable row level security;
