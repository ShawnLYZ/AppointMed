-- AppointMed: sync profile role/hospital_id from auth app_metadata.
--
-- Why: Supabase GoTrue's admin createUser({ app_metadata }) writes app_metadata
-- via a POST-INSERT UPDATE on auth.users, which runs AFTER the handle_new_user
-- AFTER INSERT trigger (20260702000200) has already created the profile with the
-- coalesce-default role='patient'/hospital_id=null. Without this, admin-created
-- managers (demo manager, later phases) silently land as patients.
--
-- Fix: re-sync the profile whenever auth.users.raw_app_meta_data changes (GoTrue's
-- post-insert metadata write fires exactly this), plus a one-time backfill for any
-- profile that predates this trigger.

create or replace function public.sync_profile_from_app_metadata()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set
    role        = coalesce(new.raw_app_meta_data->>'role', role),
    hospital_id = coalesce(nullif(new.raw_app_meta_data->>'hospital_id','')::uuid, hospital_id)
  where id = new.id;
  return new;
end $$;

create trigger on_auth_user_app_metadata_updated
  after update on auth.users
  for each row
  when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
  execute function public.sync_profile_from_app_metadata();

-- One-time backfill: correct any profile whose role/hospital_id drifted from its
-- auth app_metadata (e.g. managers created before this trigger existed). Idempotent:
-- only rows actually out of sync are updated; re-running changes nothing.
update public.profiles p set
  role        = coalesce(u.raw_app_meta_data->>'role', p.role),
  hospital_id = coalesce(nullif(u.raw_app_meta_data->>'hospital_id','')::uuid, p.hospital_id)
from auth.users u
where u.id = p.id
  and (
    coalesce(u.raw_app_meta_data->>'role', p.role) is distinct from p.role
    or coalesce(nullif(u.raw_app_meta_data->>'hospital_id','')::uuid, p.hospital_id) is distinct from p.hospital_id
  );
