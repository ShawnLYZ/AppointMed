// RLS isolation suite — the Phase 1 gate.
// Red before 20260702000300_rls_policies.sql is pushed; green after.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEST,
  ensureFixtures,
  signedInClient,
  anonClient,
  adminClient,
  cleanupSignupUser,
} from './helpers.mjs';

before(async () => {
  await ensureFixtures();
});

test('patient A sees own appointment', async () => {
  const c = await signedInClient(TEST.patientA);
  const { data, error } = await c.from('appointments').select('id, user_id');
  assert.equal(error, null);
  assert.ok(data.some((r) => r.id === TEST.appointmentA), 'own appointment visible');
});

test('patient B sees zero appointments (cannot see patient A rows)', async () => {
  const c = await signedInClient(TEST.patientB);
  const { data, error } = await c.from('appointments').select('id');
  assert.equal(error, null);
  assert.equal(data.length, 0);
});

test('patient B cannot read patient A notifications or ai_chats', async () => {
  const c = await signedInClient(TEST.patientB);
  const n = await c.from('notifications').select('id');
  const a = await c.from('ai_chats').select('id');
  assert.equal(n.error, null);
  assert.equal(a.error, null);
  assert.equal(n.data.length, 0);
  assert.equal(a.data.length, 0);
});

test('patient B sees only own profile row', async () => {
  const c = await signedInClient(TEST.patientB);
  const { data, error } = await c.from('profiles').select('id, email');
  assert.equal(error, null);
  assert.equal(data.length, 1);
  assert.equal(data[0].email, TEST.patientB);
});

test('manager X sees hospital A appointments; manager Y sees none', async () => {
  const x = await signedInClient(TEST.managerX);
  const y = await signedInClient(TEST.managerY);
  const rx = await x.from('appointments').select('id, hospital_id');
  const ry = await y.from('appointments').select('id');
  assert.equal(rx.error, null);
  assert.equal(ry.error, null);
  assert.ok(rx.data.some((r) => r.id === TEST.appointmentA), 'manager X sees the fixture request');
  assert.ok(rx.data.every((r) => r.hospital_id === TEST.hospitalA), 'manager X sees only own hospital');
  assert.equal(ry.data.length, 0);
});

test('managers see only their own hospital api keys and subscriptions', async () => {
  const x = await signedInClient(TEST.managerX);
  const y = await signedInClient(TEST.managerY);
  const kx = await x.from('hospital_api_keys').select('hospital_id');
  const ky = await y.from('hospital_api_keys').select('hospital_id');
  const sy = await y.from('subscriptions').select('hospital_id');
  assert.equal(kx.error, null);
  assert.ok(kx.data.length >= 1 && kx.data.every((r) => r.hospital_id === TEST.hospitalA));
  assert.ok(ky.data.length >= 1 && ky.data.every((r) => r.hospital_id === TEST.hospitalB));
  assert.ok(sy.data.length >= 1 && sy.data.every((r) => r.hospital_id === TEST.hospitalB));
});

test('patients cannot read subscriptions or api keys at all', async () => {
  const c = await signedInClient(TEST.patientA);
  const s = await c.from('subscriptions').select('id');
  const k = await c.from('hospital_api_keys').select('id');
  assert.equal(s.error, null);
  assert.equal(k.error, null);
  assert.equal(s.data.length, 0);
  assert.equal(k.data.length, 0);
});

test('authenticated users can read the catalog (hospitals, specialists, slots)', async () => {
  const c = await signedInClient(TEST.patientA);
  const h = await c.from('hospitals').select('id');
  assert.equal(h.error, null);
  assert.ok(h.data.length >= 2, 'catalog visible to signed-in users');
});

test('anon (signed-out) reads nothing', async () => {
  const c = anonClient();
  const h = await c.from('hospitals').select('id');
  const a = await c.from('appointments').select('id');
  assert.equal(h.data?.length ?? 0, 0);
  assert.equal(a.data?.length ?? 0, 0);
});

test('workflow runs/steps are service-only (no client access)', async () => {
  const c = await signedInClient(TEST.patientA);
  const r = await c.from('workflow_runs').select('id');
  const s = await c.from('workflow_steps').select('id');
  assert.equal(r.data?.length ?? 0, 0);
  assert.equal(s.data?.length ?? 0, 0);
});

test('patient can update own full_name but not own role', async () => {
  const c = await signedInClient(TEST.patientA);
  const ok = await c.from('profiles').update({ full_name: 'RLS Patient A (edited)' })
    .eq('email', TEST.patientA).select('full_name');
  assert.equal(ok.error, null);
  assert.equal(ok.data.length, 1);
  assert.equal(ok.data[0].full_name, 'RLS Patient A (edited)');

  const esc = await c.from('profiles').update({ role: 'hospital_manager' })
    .eq('email', TEST.patientA);
  assert.notEqual(esc.error, null, 'role update must be rejected (column not granted)');
});

test('patient can mark own notification read but cannot insert appointments', async () => {
  const c = await signedInClient(TEST.patientA);
  const ok = await c.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('id', TEST.notificationA).select('id, read_at');
  assert.equal(ok.error, null);
  assert.equal(ok.data.length, 1);
  assert.notEqual(ok.data[0].read_at, null);

  const ins = await c.from('appointments').insert({
    user_id: '00000000-0000-4000-8000-000000000000',
    hospital_id: TEST.hospitalA,
    starts_at: new Date().toISOString(),
  });
  // 42501 = permission denied: rejection must come from grants/RLS, not the
  // user_id FK (23503), which is what fires while writes are still open.
  assert.equal(ins.error?.code, '42501', 'direct insert must be rejected by grants/RLS');
});

test('self-signup cannot escalate role via user_metadata', async (t) => {
  const email = `rls-signup-${Date.now()}@test.appointmed.demo`;
  t.after(async () => cleanupSignupUser(email));

  const c = anonClient();
  const { data, error } = await c.auth.signUp({
    email,
    password: TEST.password,
    options: { data: { role: 'hospital_manager', full_name: 'Escalation Attempt' } },
  });
  assert.equal(error, null);

  const admin = adminClient();
  const { data: prof, error: profErr } = await admin
    .from('profiles').select('role').eq('id', data.user.id).single();
  assert.equal(profErr, null);
  assert.equal(prof.role, 'patient', 'app_metadata-less signup must land as patient');
});
