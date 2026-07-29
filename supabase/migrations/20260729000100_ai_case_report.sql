-- AI case report + attachment manifest for the hospital portal.
--
-- Additive only: no table-count change (db:verify still expects 12/12) and no
-- new RLS policy — the existing "own or hospital appointments" select policy in
-- 20260702000300_rls_policies.sql already covers new columns on this table, and
-- the migration's blanket `revoke insert, update, delete ... from anon,
-- authenticated` still denies every client write path to them.
--
-- ai_report is nullable so rows booked before this shipped stay valid; the
-- portal falls back to rendering ai_summary for those. ai_attachments defaults
-- to '[]' so the portal can read .length with no null guard.
alter table public.appointments
  add column if not exists ai_report jsonb,
  add column if not exists ai_attachments jsonb not null default '[]'::jsonb;
