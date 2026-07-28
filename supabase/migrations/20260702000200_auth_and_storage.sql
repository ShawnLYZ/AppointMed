-- Signup → profile trigger.
-- SECURITY: role/hospital_id come from raw_app_meta_data, which only the
-- service-role admin API can set. Self-signups (anon key) can only pass
-- user_metadata, so they always land as role='patient'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, passport, phone, email, hospital_id)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'role', 'patient'),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'passport', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.email, ''),
    nullif(new.raw_app_meta_data->>'hospital_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage buckets. Uploads happen only via the engine (service role);
-- patients may read their own files (path convention: <user_id>/<filename>).
-- verification-docs has no client policies at all (service-role only).
insert into storage.buckets (id, name, public)
values
  ('medical-files', 'medical-files', false),
  ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

-- Guarded: on some hosted projects the postgres role cannot create policies on
-- storage.objects ("must be owner"). Non-fatal — the engine serves files via
-- signed URLs (service role) either way; if skipped, add the policy in the
-- dashboard (Storage → Policies) and note it in supabase/README.md.
do $$ begin
  create policy "patients read own medical files"
    on storage.objects for select to authenticated
    using (bucket_id = 'medical-files' and (storage.foldername(name))[1] = auth.uid()::text);
exception when insufficient_privilege then
  raise notice 'storage.objects policy skipped (insufficient privilege) - create it via the dashboard';
end $$;
