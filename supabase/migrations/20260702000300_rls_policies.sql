-- Least-privilege RLS. Replaces v1's `allow read, write: if true` posture.
-- Model: clients are read-only (writes go through the Node services with the
-- service-role key), except two narrow owner-updates enforced by column grants:
--   profiles(full_name, passport, phone, avatar_url), notifications(read_at).

-- Manager's hospital, usable inside policies without recursive profile reads.
create or replace function public.current_hospital_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select hospital_id from public.profiles where id = auth.uid() $$;
grant execute on function public.current_hospital_id() to authenticated;

alter table public.hospitals enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.hospital_api_keys enable row level security;
alter table public.specialists enable row level security;
alter table public.slots enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.appointments enable row level security;
alter table public.ai_chats enable row level security;
alter table public.notifications enable row level security;

-- Lock down writes at the grant level too (clear errors + defense in depth).
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant update (full_name, passport, phone, avatar_url) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- profiles: own row only.
create policy "select own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- catalog: any signed-in user can browse hospitals/specialists/slots.
create policy "catalog hospitals" on public.hospitals
  for select to authenticated using (true);
create policy "catalog specialists" on public.specialists
  for select to authenticated using (true);
create policy "catalog slots" on public.slots
  for select to authenticated using (true);

-- appointments: patient sees own; manager sees their hospital's.
create policy "own or hospital appointments" on public.appointments
  for select to authenticated
  using (user_id = auth.uid() or hospital_id = public.current_hospital_id());

-- ai_chats / notifications: owner only.
create policy "own ai chats" on public.ai_chats
  for select to authenticated using (user_id = auth.uid());
create policy "own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "mark own notification read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- subscriptions / api keys: the hospital's manager only.
create policy "own hospital subscription" on public.subscriptions
  for select to authenticated using (hospital_id = public.current_hospital_id());
create policy "own hospital api keys" on public.hospital_api_keys
  for select to authenticated using (hospital_id = public.current_hospital_id());

-- workflow_runs / workflow_steps: RLS enabled, NO policies — service-role only.
