import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ANON_KEY, ENGINE_FIX, makeTestContext, type TestContext } from './helpers.js';
import { makeSupabase } from '../src/supabase.js';
import { config } from '../src/config.js';

let ctx: TestContext;
const admin = makeSupabase(config.supabaseUrl, config.supabaseServiceRoleKey);

// This suite creates real hospitals + auth users + storage objects OUTSIDE
// the shared ENGINE_FIX/patient fixtures - track them so afterAll can
// best-effort tear every one of them down (never touch ENGINE_FIX or the
// shared patient).
const createdHospitalIds: string[] = [];
const createdEmails: string[] = [];

beforeAll(async () => { ctx = await makeTestContext(); });

// This project's storage.objects has a protect_objects_delete trigger that
// rejects raw SQL DELETEs ("Use the Storage API instead") - so cleanup must
// go through supabase.storage's remove(), not a pool.query DELETE (which
// would throw and get silently swallowed by a best-effort try/catch, leaking
// the object forever). List first (plain SELECT is unaffected), then remove.
async function purgeStorageObjects(bucket: string, hospitalId: string): Promise<void> {
  const { rows } = await ctx.pool.query(
    'select name from storage.objects where bucket_id = $1 and name like $2', [bucket, `${hospitalId}/%`]);
  if (rows.length === 0) return;
  await admin.storage.from(bucket).remove(rows.map((r: { name: string }) => r.name));
}

afterAll(async () => {
  for (const hospitalId of createdHospitalIds) {
    try { await purgeStorageObjects('verification-docs', hospitalId); } catch { /* best-effort */ }
    try { await purgeStorageObjects('medical-files', hospitalId); } catch { /* best-effort */ }
  }
  for (const email of createdEmails) {
    try {
      const { rows } = await ctx.pool.query('select id from auth.users where email = $1', [email]);
      if (rows.length > 0) await admin.auth.admin.deleteUser(rows[0].id);
    } catch { /* best-effort */ }
  }
  for (const hospitalId of createdHospitalIds) {
    // specialists/slots/subscriptions/api_keys cascade off hospitals; the
    // manager's profile already cascaded off the auth user deleted above -
    // this MUST run after the auth-user deletes above, or the still-live
    // profile.hospital_id FK would block it.
    try { await ctx.pool.query('delete from public.hospitals where id = $1', [hospitalId]); } catch { /* best-effort */ }
  }
  await ctx.close();
});

const auth = () => ({ authorization: `Bearer ${ctx.token}` });

type Plan = 'starter' | 'growth' | 'enterprise';

function subscribeBody(email: string, opts: { plan?: Plan; hospitalName?: string } = {}) {
  return {
    hospital: {
      name: opts.hospitalName ?? `Engine Subtest Hospital ${Date.now()}`,
      address: '1 Subtest Way, Kuala Lumpur',
      workingHours: { 'Mon-Fri': '09:00-18:00' },
    },
    plan: opts.plan ?? 'growth',
    manager: { email, password: ENGINE_FIX.password, fullName: 'Engine Subtest Manager', phone: '+60123456789' },
    billing: { cardholder: 'Engine Subtest Manager', cardLast4: '4242' },
  };
}

const subscribe = (email: string, opts?: { plan?: Plan; hospitalName?: string }) =>
  ctx.app.inject({ method: 'POST', url: '/portal/subscribe', payload: subscribeBody(email, opts) });

async function signInManager(email: string): Promise<string> {
  const anon = createClient(config.supabaseUrl, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: ENGINE_FIX.password });
  if (error) throw new Error(error.message);
  return data.session!.access_token;
}

function multipartFiles(files: { filename: string; contentType: string; data: Buffer }[]) {
  const boundary = '----vitestboundaryportal';
  const chunks: Buffer[] = [];
  for (const f of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="${f.filename}"\r\n` +
      `content-type: ${f.contentType}\r\n\r\n`));
    chunks.push(f.data);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

test('subscribe: happy path creates hospital, growth subscription, key, starter inventory, and a manager profile', async () => {
  const email = `engine-subtest-${Date.now()}@test.appointmed.demo`;
  const res = await subscribe(email, { plan: 'growth' });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  expect(body).toMatchObject({ plan: 'growth', monthlyPriceRm: 1200, managerEmail: email });
  expect(body.apiKey).toMatch(/^amk_live_[0-9a-f]{24}$/);
  expect(typeof body.hospitalId).toBe('string');
  createdHospitalIds.push(body.hospitalId);
  createdEmails.push(email);

  const sub = await ctx.pool.query(
    'select plan, status, monthly_price_rm, max_specialists from public.subscriptions where hospital_id = $1',
    [body.hospitalId]);
  expect(sub.rows).toHaveLength(1);
  expect(sub.rows[0].plan).toBe('growth');
  expect(sub.rows[0].status).toBe('active');
  expect(Number(sub.rows[0].monthly_price_rm)).toBe(1200);
  expect(sub.rows[0].max_specialists).toBe(20);

  const key = await ctx.pool.query(
    'select api_key, is_active from public.hospital_api_keys where hospital_id = $1', [body.hospitalId]);
  expect(key.rows).toHaveLength(1);
  expect(key.rows[0].api_key).toBe(body.apiKey);
  expect(key.rows[0].is_active).toBe(true);

  const specialists = await ctx.pool.query(
    'select count(*)::int as n from public.specialists where hospital_id = $1', [body.hospitalId]);
  expect(specialists.rows[0].n).toBe(3);

  const slots = await ctx.pool.query(
    'select count(*)::int as n from public.slots where hospital_id = $1', [body.hospitalId]);
  expect(slots.rows[0].n).toBeGreaterThan(0);

  const profile = await ctx.pool.query(
    `select p.role, p.hospital_id from public.profiles p join auth.users u on u.id = p.id where u.email = $1`,
    [email]);
  expect(profile.rows).toHaveLength(1);
  expect(profile.rows[0]).toEqual({ role: 'hospital_manager', hospital_id: body.hospitalId });
});

test('subscribe: duplicate email → 409 email_in_use, and the second hospital row is compensated (deleted)', async () => {
  const email = `engine-subtest-${Date.now()}@test.appointmed.demo`;
  const hospitalName = `Engine Subtest Dup Hospital ${Date.now()}`;
  const first = await subscribe(email, { hospitalName });
  expect(first.statusCode).toBe(201);
  createdHospitalIds.push(first.json().hospitalId);
  createdEmails.push(email);

  const second = await subscribe(email, { hospitalName });
  expect(second.statusCode).toBe(409);
  expect(second.json()).toEqual({ error: 'email_in_use' });

  // The failed second attempt's hospital insert must have been compensated -
  // only the first attempt's row should survive under this name.
  const rows = await ctx.pool.query('select count(*)::int as n from public.hospitals where name = $1', [hospitalName]);
  expect(rows.rows[0].n).toBe(1);
});

test('subscribe: missing required fields → 400 invalid_subscription', async () => {
  const res = await ctx.app.inject({
    method: 'POST', url: '/portal/subscribe',
    payload: { hospital: { name: '', address: 'x' }, plan: 'growth', manager: { email: '', password: '' }, billing: {} },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json()).toEqual({ error: 'invalid_subscription' });
});

test('manager routes: toggle own specialist, 404 on a foreign one, key regeneration, doc upload, 403 for a patient token', async () => {
  const email = `engine-subtest-${Date.now()}@test.appointmed.demo`;
  const subRes = await subscribe(email, { plan: 'starter' });
  expect(subRes.statusCode).toBe(201);
  const { hospitalId } = subRes.json();
  createdHospitalIds.push(hospitalId);
  createdEmails.push(email);

  const managerToken = await signInManager(email);
  const managerAuth = () => ({ authorization: `Bearer ${managerToken}` });

  const ownSpecialist = await ctx.pool.query(
    'select id, is_active from public.specialists where hospital_id = $1 limit 1', [hospitalId]);
  const specialistId = ownSpecialist.rows[0].id as string;
  const wasActive = ownSpecialist.rows[0].is_active as boolean;

  // patient token on a manager route -> 403, never reaching the tenancy check
  const patientAttempt = await ctx.app.inject({
    method: 'POST', url: `/portal/specialists/${specialistId}/toggle`, headers: auth(),
  });
  expect(patientAttempt.statusCode).toBe(403);
  expect(patientAttempt.json()).toEqual({ error: 'manager_only' });

  // own specialist -> flips is_active
  const toggleOwn = await ctx.app.inject({
    method: 'POST', url: `/portal/specialists/${specialistId}/toggle`, headers: managerAuth(),
  });
  expect(toggleOwn.statusCode).toBe(200);
  expect(toggleOwn.json()).toEqual({ id: specialistId, isActive: !wasActive });

  // ENGINE_FIX.specialistA belongs to hospital A, not this brand-new manager -> 404
  const toggleForeign = await ctx.app.inject({
    method: 'POST', url: `/portal/specialists/${ENGINE_FIX.specialistA}/toggle`, headers: managerAuth(),
  });
  expect(toggleForeign.statusCode).toBe(404);
  expect(toggleForeign.json()).toEqual({ error: 'specialist_not_found' });

  // regenerate: new key returned, old key row deactivated
  const oldKeyRow = await ctx.pool.query(
    'select api_key from public.hospital_api_keys where hospital_id = $1 and is_active', [hospitalId]);
  const oldKey = oldKeyRow.rows[0].api_key as string;
  const regen = await ctx.app.inject({ method: 'POST', url: '/portal/api-key/regenerate', headers: managerAuth() });
  expect(regen.statusCode).toBe(200);
  const newKey = regen.json().apiKey as string;
  expect(newKey).toMatch(/^amk_live_[0-9a-f]{24}$/);
  expect(newKey).not.toBe(oldKey);
  const keys = await ctx.pool.query(
    'select api_key, is_active from public.hospital_api_keys where hospital_id = $1', [hospitalId]);
  expect(keys.rows.find((r: { api_key: string }) => r.api_key === oldKey)?.is_active).toBe(false);
  expect(keys.rows.find((r: { api_key: string }) => r.api_key === newKey)?.is_active).toBe(true);

  // verification-docs: repeatable multipart upload lands under verification-docs/<hospitalId>/
  const { payload, headers } = multipartFiles([
    { filename: 'license.pdf', contentType: 'application/pdf', data: Buffer.from('%PDF-1.4 fake license') },
    { filename: 'permit.png', contentType: 'image/png', data: Buffer.from('89504e470d0a1a0a', 'hex') },
  ]);
  const upload = await ctx.app.inject({
    method: 'POST', url: '/portal/verification-docs', headers: { ...managerAuth(), ...headers }, payload,
  });
  expect(upload.statusCode).toBe(200);
  expect(upload.json().uploaded.slice().sort()).toEqual(['license.pdf', 'permit.png']);
  const objects = await ctx.pool.query(
    `select name from storage.objects where bucket_id = 'verification-docs' and name like $1`, [`${hospitalId}/%`]);
  expect(objects.rows.length).toBe(2);
});
