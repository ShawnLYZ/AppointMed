import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ANON_KEY, ENGINE_FIX, makeTestContext, type TestContext } from './helpers.js';
import { makeSupabase } from '../src/supabase.js';
import { config } from '../src/config.js';

let ctx: TestContext;
const admin = makeSupabase(config.supabaseUrl, config.supabaseServiceRoleKey);

const MANAGER_A = 'attach-manager-a@test.appointmed.demo';
let managerToken = '';
let managerId = '';
let runId = '';
let apptId = '';
const OBJECT = () => `${ctx.userId}/${runId}/report.png`;

beforeAll(async () => {
  ctx = await makeTestContext();

  // A hospital_manager for hospital A. role/hospital_id live in app_metadata,
  // which only the service-role admin API can write.
  const existing = await ctx.pool.query('select id from auth.users where email = $1', [MANAGER_A]);
  if (existing.rows.length === 0) {
    const { error } = await admin.auth.admin.createUser({
      email: MANAGER_A, password: ENGINE_FIX.password, email_confirm: true,
      app_metadata: { role: 'hospital_manager', hospital_id: ENGINE_FIX.hospitalA },
      user_metadata: { full_name: 'Attach Manager A' },
    });
    if (error) throw new Error(error.message);
  }
  const anon = createClient(config.supabaseUrl, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: MANAGER_A, password: ENGINE_FIX.password });
  if (error) throw new Error(error.message);
  managerToken = data.session!.access_token;
  managerId = data.user!.id;

  // A run whose state carries one attachment, and a real object behind it.
  const run = await ctx.pool.query(
    `insert into public.workflow_runs (user_id, current_node, status, state)
     values ($1, 'hospital_review', 'waiting_hospital', $2::jsonb) returning id`,
    [ctx.userId, JSON.stringify({
      symptoms: {}, attachments: [{ type: 'image', name: 'report.png', path: '', observation: 'A photo.' }],
      pendingImages: [], excludeHospitalIds: [], relaxations: [],
    })]);
  runId = run.rows[0].id;
  await admin.storage.from('medical-files')
    .upload(OBJECT(), Buffer.from('89504e470d0a1a0a', 'hex'), { contentType: 'image/png', upsert: true });
  await ctx.pool.query(
    `update public.workflow_runs
        set state = jsonb_set(state, '{attachments,0,path}', to_jsonb($2::text))
      where id = $1`, [runId, OBJECT()]);

  const appt = await ctx.pool.query(
    `insert into public.appointments
       (user_id, hospital_id, run_id, starts_at, status, ai_attachments)
     values ($1,$2,$3, now() + interval '2 days', 'pending', '[]'::jsonb) returning id`,
    [ctx.userId, ENGINE_FIX.hospitalA, runId]);
  apptId = appt.rows[0].id;
});

afterAll(async () => {
  await ctx.pool.query('delete from public.appointments where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.workflow_runs where user_id = $1', [ctx.userId]);
  // storage.objects has a protect_objects_delete trigger that rejects raw SQL
  // DELETEs - remove via the Storage API, same as upload.test.ts.
  try { await admin.storage.from('medical-files').remove([OBJECT()]); } catch { /* best-effort */ }
  await ctx.close();
});

const asManager = () => ({ authorization: `Bearer ${managerToken}` });
const get = (id: string, headers: Record<string, string>) =>
  ctx.app.inject({ method: 'GET', url: `/portal/appointments/${id}/attachments`, headers });

test('a manager gets a signed URL for each attachment on their own hospital request', async () => {
  const res = await get(apptId, asManager());
  expect(res.statusCode).toBe(200);
  const { attachments } = res.json();
  expect(attachments).toHaveLength(1);
  expect(attachments[0]).toMatchObject({ type: 'image', name: 'report.png', observation: 'A photo.' });
  expect(attachments[0].signedUrl).toContain('/medical-files/');
  // The response must carry no separate path field. The signed URL necessarily
  // embeds the object path - that is how Supabase signed URLs work, and the token
  // is what gates access, not path secrecy. This mirrors the manifest guard in
  // booking.test.ts.
  expect(attachments[0]).not.toHaveProperty('path');
});

test('viewing attachments writes a tool_call step against the patient run', async () => {
  await get(apptId, asManager());
  const steps = await ctx.pool.query(
    `select kind, node, input from public.workflow_steps where run_id = $1 and kind = 'tool_call'`, [runId]);
  const viewed = steps.rows.find((r: { input: { tool?: string } }) => r.input?.tool === 'signAttachments');
  expect(viewed).toBeDefined();
  expect(viewed.node).toBe('hospital_review');
  expect(viewed.input.hospitalId).toBe(ENGINE_FIX.hospitalA);
  // "which hospital opened my files, and who" - hospitalId answers the first
  // half, viewedBy (the manager's own user id) the second.
  expect(viewed.input.viewedBy).toBe(managerId);
});

test('a patient is refused - this route is manager-only', async () => {
  const res = await get(apptId, { authorization: `Bearer ${ctx.token}` });
  expect(res.statusCode).toBe(403);
  expect(res.json()).toEqual({ error: 'manager_only' });
});

test('another hospital cannot reach it, and gets a 404 not a 403', async () => {
  await ctx.pool.query('update public.appointments set hospital_id = $2 where id = $1',
    [apptId, ENGINE_FIX.hospitalB]);
  try {
    const res = await get(apptId, asManager());
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'appointment_not_found' });
  } finally {
    // Always restore, even if an assertion above throws - a mid-test throw
    // would otherwise leave the shared fixture appointment on hospital B and
    // poison every later test in this file (which could then pass a 404 for
    // the wrong reason).
    await ctx.pool.query('update public.appointments set hospital_id = $2 where id = $1',
      [apptId, ENGINE_FIX.hospitalA]);
  }
});

test('a declined request closes the window with the same 404', async () => {
  await ctx.pool.query(`update public.appointments set status = 'declined' where id = $1`, [apptId]);
  try {
    const res = await get(apptId, asManager());
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'appointment_not_found' });
  } finally {
    // Same reasoning as above: restore unconditionally so a failed assertion
    // doesn't leave the shared fixture appointment stuck as 'declined'.
    await ctx.pool.query(`update public.appointments set status = 'pending' where id = $1`, [apptId]);
  }
});

test('an appointment with no run returns an empty list, not an error', async () => {
  const orphan = await ctx.pool.query(
    `insert into public.appointments (user_id, hospital_id, starts_at, status)
     values ($1,$2, now() + interval '2 days', 'pending') returning id`,
    [ctx.userId, ENGINE_FIX.hospitalA]);
  const res = await get(orphan.rows[0].id, asManager());
  expect(res.statusCode).toBe(200);
  expect(res.json().attachments).toEqual([]);
});

test('an unknown appointment id is a 404', async () => {
  const res = await get('00000000-0000-4000-8000-00000000dead', asManager());
  expect(res.statusCode).toBe(404);
  expect(res.json()).toEqual({ error: 'appointment_not_found' });
});
