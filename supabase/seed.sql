-- AppointMed demo seed. Idempotent: upserts domain rows and regenerates all
-- OPEN future slots (booked slots are never touched). Run via `npm run db:seed`.
begin;

-- ── hospitals (fixed UUIDs, referenced across phases) ───────────────────────
insert into public.hospitals (id, name, address, working_hours) values
  ('10000000-0000-4000-8000-000000000001', 'KL Medical Center', '123 Jalan Tun Razak, Kuala Lumpur, 50400', '{"Mon-Fri":"08:00-20:00","Sat":"08:00-14:00","Sun":"Closed"}'),
  ('10000000-0000-4000-8000-000000000002', 'Sunway Medical Centre', '5 Jalan Lagoon Selatan, Subang Jaya, 47500', '{"Mon-Sun":"08:00-22:00"}'),
  ('10000000-0000-4000-8000-000000000003', 'Gleneagles Kuala Lumpur', '286 & 288 Jalan Ampang, Kuala Lumpur, 50450', '{"Mon-Sun":"24 Hours"}'),
  ('10000000-0000-4000-8000-000000000004', 'Prince Court Medical Centre', '39 Jalan Kia Peng, Kuala Lumpur, 50450', '{"Mon-Sun":"24 Hours"}'),
  ('10000000-0000-4000-8000-000000000005', 'Pantai Hospital Kuala Lumpur', '8 Jalan Bukit Pantai, Bangsar, 59100', '{"Mon-Sun":"24 Hours"}'),
  ('10000000-0000-4000-8000-000000000006', 'Columbia Asia Hospital PJ', '39 Jalan Ikram-Uniten, Petaling Jaya, 47810', '{"Mon-Fri":"08:00-18:00","Sat":"08:00-13:00","Sun":"Closed"}')
on conflict (id) do update
  set name = excluded.name, address = excluded.address, working_hours = excluded.working_hours;

-- ── specialists (20, ported 1:1 from mock_data_service.dart) ────────────────
insert into public.specialists (id, hospital_id, full_name, specialty, price) values
  -- KL Medical Center
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Dr. Sarah Chen', 'Cardiology', 150.00),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Dr. Ahmad Rizal', 'Neurology', 200.00),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Dr. Wei Ming Tan', 'Orthopedics', 180.00),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Dr. Priya Nair', 'General Practice', 80.00),
  -- Sunway Medical Centre
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'Dr. Michael Lim', 'Dermatology', 120.00),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'Dr. Anita Sharma', 'Pediatrics', 100.00),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'Dr. Robert Wong', 'Gastroenterology', 160.00),
  -- Gleneagles Kuala Lumpur
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000003', 'Dr. Karim Hassan', 'Cardiology', 220.00),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000003', 'Dr. Lisa Tan', 'Dermatology', 150.00),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000003', 'Dr. James Ooi', 'Orthopedics', 230.00),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000003', 'Dr. Mei Lin Chow', 'Neurology', 250.00),
  -- Prince Court Medical Centre
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000004', 'Dr. Suresh Kumar', 'ENT', 130.00),
  ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000004', 'Dr. Natasha Ibrahim', 'Pediatrics', 120.00),
  ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000004', 'Dr. David Ng', 'General Practice', 70.00),
  -- Pantai Hospital Kuala Lumpur
  ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000005', 'Dr. Aisha Mohd', 'Cardiology', 180.00),
  ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000005', 'Dr. Chen Wei', 'Pulmonology', 160.00),
  ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000005', 'Dr. Raj Patel', 'Orthopedics', 190.00),
  -- Columbia Asia Hospital PJ
  ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000006', 'Dr. Hakim Zulkifli', 'General Practice', 60.00),
  ('20000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000006', 'Dr. Grace Loh', 'Dermatology', 110.00),
  ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000006', 'Dr. Arjun Singh', 'Gastroenterology', 140.00)
on conflict (id) do update
  set full_name = excluded.full_name, specialty = excluded.specialty, price = excluded.price;

-- ── subscriptions (mixed tiers for a richer demo; prices per PRD) ───────────
insert into public.subscriptions (id, hospital_id, plan, status, monthly_price_rm, booking_fee_pct, max_specialists, renews_at) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'growth',     'active', 1200.00, 3, 20,   now() + interval '1 month'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'starter',    'active',  500.00, 3, 5,    now() + interval '1 month'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'enterprise', 'active', 2500.00, 3, null, now() + interval '1 month'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'growth',     'active', 1200.00, 3, 20,   now() + interval '1 month'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'starter',    'active',  500.00, 3, 5,    now() + interval '1 month'),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'starter',    'active',  500.00, 3, 5,    now() + interval '1 month')
on conflict (id) do update set plan = excluded.plan, status = 'active', renews_at = excluded.renews_at;

-- ── per-hospital API keys (fixed demo values, documented in supabase/README.md)
insert into public.hospital_api_keys (id, hospital_id, api_key, label) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'amk_demo_klmedical_1f2e3d4c5b6a7988', 'Demo key'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'amk_demo_sunway_2a3b4c5d6e7f8091',    'Demo key'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'amk_demo_gleneagles_3c4d5e6f708192a3', 'Demo key'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'amk_demo_princecourt_4e5f60718293a4b5', 'Demo key'),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'amk_demo_pantai_5a6b7c8d9e0f1a2b',    'Demo key'),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', 'amk_demo_columbia_6c7d8e9f0a1b2c3d',  'Demo key')
on conflict (id) do update set api_key = excluded.api_key, is_active = true;

-- ── rolling slots ───────────────────────────────────────────────────────────
-- Regenerate OPEN slots for the six demo hospitals above: next 7 days,
-- 09/10/11/14/15/16 Kuala Lumpur time, skipping Sundays; price copied from the
-- specialist. Booked slots survive.
--
-- Both statements below are scoped to the demo hospital ids so this seed only
-- ever touches demo data, as the file header promises. Without that scope the
-- unqualified `delete from public.slots where status = 'open'` also wiped the
-- test-fixture slots owned by the adapter/engine suites (and the regenerate
-- step then flooded those fixture hospitals with demo slots), breaking
-- `appointmed_hospital_adapter`'s slots tests after every reseed. Hospitals
-- created at runtime (portal subscriptions) are likewise left untouched.
create temporary table demo_hospital_ids (id uuid primary key) on commit drop;
insert into demo_hospital_ids (id) values
  ('10000000-0000-4000-8000-000000000001'),  -- KL Medical Center
  ('10000000-0000-4000-8000-000000000002'),  -- Sunway Medical Centre
  ('10000000-0000-4000-8000-000000000003'),  -- Gleneagles Kuala Lumpur
  ('10000000-0000-4000-8000-000000000004'),  -- Prince Court Medical Centre
  ('10000000-0000-4000-8000-000000000005'),  -- Pantai Hospital Kuala Lumpur
  ('10000000-0000-4000-8000-000000000006');  -- Columbia Asia Hospital PJ

delete from public.slots
where status = 'open'
  and hospital_id in (select id from demo_hospital_ids);

insert into public.slots (hospital_id, specialist_id, starts_at, ends_at, price)
select
  s.hospital_id,
  s.id,
  ((current_date + d.day)::timestamp + make_interval(hours => h.hour)) at time zone 'Asia/Kuala_Lumpur',
  ((current_date + d.day)::timestamp + make_interval(hours => h.hour, mins => 30)) at time zone 'Asia/Kuala_Lumpur',
  s.price
from public.specialists s
cross join generate_series(1, 7) as d(day)
cross join unnest(array[9, 10, 11, 14, 15, 16]) as h(hour)
where s.is_active
  and s.hospital_id in (select id from demo_hospital_ids)
  and extract(dow from current_date + d.day) <> 0; -- skip Sundays

commit;
