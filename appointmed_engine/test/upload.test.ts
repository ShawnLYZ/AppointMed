import { afterAll, beforeAll, expect, test } from 'vitest';
import { caseReport, makeTestContext, type TestContext } from './helpers.js';
import { makeSupabase } from '../src/supabase.js';
import { config } from '../src/config.js';

let ctx: TestContext;
const admin = makeSupabase(config.supabaseUrl, config.supabaseServiceRoleKey);
beforeAll(async () => { ctx = await makeTestContext(); });

// This project's storage.objects has a protect_objects_delete trigger that
// rejects raw SQL DELETEs ("Use the Storage API instead") - a pool.query
// DELETE here would throw and get silently swallowed by the best-effort
// try/catch below, leaking the object forever. List first (plain SELECT is
// unaffected), then remove via the Storage API, same as test/portal.test.ts's
// purgeStorageObjects helper.
async function purgeMedicalFiles(): Promise<void> {
  const { rows } = await ctx.pool.query(
    `select name from storage.objects where bucket_id = 'medical-files' and name like $1`,
    [`${ctx.userId}/%`]);
  if (rows.length === 0) return;
  await admin.storage.from('medical-files').remove(rows.map((r: { name: string }) => r.name));
}

afterAll(async () => {
  await ctx.pool.query('delete from public.appointments where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.ai_chats where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.notifications where user_id = $1', [ctx.userId]);
  await ctx.pool.query('delete from public.workflow_runs where user_id = $1', [ctx.userId]); // steps cascade
  // best-effort: this suite is the only one that writes real objects into the
  // medical-files bucket - clean them up so runs don't accumulate, but never
  // fail the suite over storage cleanup.
  try { await purgeMedicalFiles(); } catch { /* best-effort */ }
  await ctx.close();
});

const auth = () => ({ authorization: `Bearer ${ctx.token}` });
const start = async () => {
  const res = await ctx.app.inject({ method: 'POST', url: '/consult/start', headers: auth() });
  expect(res.statusCode).toBe(200);
  return res.json();
};

const nullFields = {
  mainComplaint: null, duration: null, severity: null,
  associatedSymptoms: null, medicalHistory: null, currentMedications: null,
};

// Drives a fresh run out of intake into triage->match (same pattern as
// test/match.test.ts's driveToMatch, but we only need to reach the `match`
// node - runTriage flips run.node to 'match' in the same turn intake
// completes, so no prefs-collection round trip is needed here).
const completeIntake = {
  reply: 'Thank you, I have everything I need.', complete: true, redFlag: false,
  fields: { mainComplaint: 'chest tightness on exertion', duration: '2 weeks', severity: 6,
    associatedSymptoms: 'breathless climbing stairs', medicalHistory: 'hypertension', currentMedications: 'amlodipine' },
};
const cardiologyVerdict = {
  specialty: 'Cardiology', urgency: 'week',
  explanation: 'Exertional chest tightness with hypertension warrants a cardiology review.',
  redFlags: [],
};

function multipart(filename: string, contentType: string, data: Buffer) {
  const boundary = '----vitestboundary';
  const head = Buffer.from(
    `--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `content-type: ${contentType}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

test('image upload stores the file, queues base64 for the model, and runs an intake turn', async () => {
  const { runId } = await start();
  // Two decisions now: the attachment stage describes the image at upload, then
  // the intake turn runs. FIFO order matters - attachment first.
  ctx.ollama.enqueue(
    { observation: 'Erythematous plaque on the left forearm with silvery scale.' },
    { reply: 'Thanks - the rash photo helps. How long have you had it?',
      complete: false, redFlag: false, fields: { ...nullFields, mainComplaint: 'rash' } });
  const png = Buffer.from('89504e470d0a1a0a', 'hex'); // PNG magic is enough for the flow
  const { payload, headers } = multipart('rash.png', 'image/png', png);
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/upload`, headers: { ...auth(), ...headers }, payload,
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().reply).toContain('rash');
  // the model call carried the image
  const lastCall = ctx.ollama.calls.at(-1)!;
  const userMsg = lastCall.messages.at(-1)!;
  expect(userMsg.images?.[0]).toBe(png.toString('base64'));
  // stored in the medical-files bucket
  const obj = await ctx.pool.query(
    `select name from storage.objects where bucket_id = 'medical-files' and name like $1`,
    [`${ctx.userId}/${runId}/%`]);
  expect(obj.rows.length).toBeGreaterThan(0);
});

test('pdf upload extracts text into the intake turn', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue(
    { observation: 'Referral letter requesting cardiology assessment.' },
    { reply: 'I see the referral mentions cardiology.', complete: false, redFlag: false, fields: nullFields });
  const { payload, headers } = multipart('referral.pdf', 'application/pdf', Buffer.from('%PDF-1.4 fake'));
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/upload`, headers: { ...auth(), ...headers }, payload,
  });
  expect(res.statusCode).toBe(200);
  const lastCall = ctx.ollama.calls.at(-1)!;
  expect(lastCall.messages.at(-1)!.content).toContain('FAKE-PDF-TEXT'); // helpers inject the extractor
});

test('unsupported type → 400; uploads outside intake → 409', async () => {
  // unsupported mimetype during intake -> 400, no LLM call made
  const { runId } = await start();
  const callsBefore = ctx.ollama.calls.length;
  const txt = multipart('notes.txt', 'text/plain', Buffer.from('just some notes'));
  const badTypeRes = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/upload`, headers: { ...auth(), ...txt.headers }, payload: txt.payload,
  });
  expect(badTypeRes.statusCode).toBe(400);
  expect(badTypeRes.json()).toEqual({ error: 'unsupported_file_type' });
  expect(ctx.ollama.calls.length).toBe(callsBefore); // guard returned before any LLM call

  // drive a separate run past intake into match, then an upload there -> 409
  const { runId: matchRunId } = await start();
  ctx.ollama.enqueue(completeIntake, cardiologyVerdict, caseReport());
  const drive = await ctx.app.inject({
    method: 'POST', url: `/consult/${matchRunId}/message`, headers: auth(), payload: { text: 'that is everything' },
  });
  expect(drive.json().node).toBe('match');
  const callsAfterDrive = ctx.ollama.calls.length;
  const png = multipart('rash.png', 'image/png', Buffer.from('89504e470d0a1a0a', 'hex'));
  const outsideIntakeRes = await ctx.app.inject({
    method: 'POST', url: `/consult/${matchRunId}/upload`, headers: { ...auth(), ...png.headers }, payload: png.payload,
  });
  expect(outsideIntakeRes.statusCode).toBe(409);
  expect(outsideIntakeRes.json()).toEqual({ error: 'uploads_only_during_intake' });
  expect(ctx.ollama.calls.length).toBe(callsAfterDrive); // guard returned before any LLM call
});

test('an escalated run seals the upload route: 409, nothing stored, no LLM call', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue({
    reply: 'This sounds serious.', complete: false, redFlag: true, redFlagReason: 'severe chest pain',
    fields: { ...nullFields, mainComplaint: 'chest pain' },
  });
  const escalate = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/message`, headers: auth(), payload: { text: 'severe crushing chest pain' },
  });
  expect(escalate.json().status).toBe('escalated'); // node stays 'intake' - status is what changed

  const callsBeforeUpload = ctx.ollama.calls.length;
  const { payload, headers } = multipart('rash.png', 'image/png', Buffer.from('89504e470d0a1a0a', 'hex'));
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/upload`, headers: { ...auth(), ...headers }, payload,
  });
  expect(res.statusCode).toBe(409);
  expect(res.json()).toEqual({ error: 'consultation_escalated' });
  expect(ctx.ollama.calls.length).toBe(callsBeforeUpload); // sealed before any LLM call

  const obj = await ctx.pool.query(
    `select name from storage.objects where bucket_id = 'medical-files' and name like $1`,
    [`${ctx.userId}/${runId}/%`]);
  expect(obj.rows.length).toBe(0); // sealed before any storage write
});

test('the image upload calls the attachment stage and persists its observation', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue(
    { observation: 'Well-demarcated erythematous plaque, roughly 4cm, with scale.' },
    { reply: 'Thanks for the photo.', complete: false, redFlag: false, fields: nullFields });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const { payload, headers } = multipart('plaque.png', 'image/png', png);
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/upload`, headers: { ...auth(), ...headers }, payload,
  });
  expect(res.statusCode).toBe(200);

  // The attachment call came first and carried the image.
  const attachmentCall = ctx.ollama.calls.at(-2)!;
  expect(attachmentCall.stage).toBe('attachment');
  expect(attachmentCall.messages.at(-1)!.images?.[0]).toBe(png.toString('base64'));

  const run = await ctx.pool.query('select state from public.workflow_runs where id = $1', [runId]);
  expect(run.rows[0].state.attachments[0]).toMatchObject({
    type: 'image', name: 'plaque.png',
    observation: 'Well-demarcated erythematous plaque, roughly 4cm, with scale.',
  });
});

test('a PDF with no text layer skips the model entirely and logs a fallback', async () => {
  const blank = await makeTestContext({ extractPdfText: async () => '   ' });
  let runId = '';
  try {
    const blankAuth = { authorization: `Bearer ${blank.token}` };
    const started = await blank.app.inject({ method: 'POST', url: '/consult/start', headers: blankAuth });
    ({ runId } = started.json());
    // ONLY the intake decision - the attachment stage must not be reached.
    blank.ollama.enqueue({ reply: 'I could not read that document.', complete: false, redFlag: false, fields: nullFields });
    const { payload, headers } = multipart('scan.pdf', 'application/pdf', Buffer.from('%PDF-1.4 scanned'));
    const res = await blank.app.inject({
      method: 'POST', url: `/consult/${runId}/upload`, headers: { ...blankAuth, ...headers }, payload,
    });
    expect(res.statusCode).toBe(200);
    expect(blank.ollama.calls.some((c) => c.stage === 'attachment')).toBe(false);

    const run = await blank.pool.query('select state from public.workflow_runs where id = $1', [runId]);
    expect(run.rows[0].state.attachments[0].observation).toContain('no extractable text layer');
    const steps = await blank.pool.query(
      'select kind, node from public.workflow_steps where run_id = $1', [runId]);
    expect(steps.rows.some((r: { kind: string }) => r.kind === 'fallback')).toBe(true);
  } finally {
    await blank.pool.query('delete from public.ai_chats where run_id = $1', [runId]);
    await blank.pool.query('delete from public.workflow_runs where id = $1', [runId]);
    await blank.close();
  }
});

test('a corrupt PDF returns 200 rather than 500', async () => {
  const broken = await makeTestContext({
    extractPdfText: async () => { throw new Error('Invalid PDF structure'); },
  });
  let runId = '';
  try {
    const brokenAuth = { authorization: `Bearer ${broken.token}` };
    const started = await broken.app.inject({ method: 'POST', url: '/consult/start', headers: brokenAuth });
    ({ runId } = started.json());
    broken.ollama.enqueue({ reply: 'I could not read that file.', complete: false, redFlag: false, fields: nullFields });
    const { payload, headers } = multipart('corrupt.pdf', 'application/pdf', Buffer.from('not really a pdf'));
    const res = await broken.app.inject({
      method: 'POST', url: `/consult/${runId}/upload`, headers: { ...brokenAuth, ...headers }, payload,
    });
    // Before this change an extractPdfText throw escaped as 500 AFTER the file
    // was already stored.
    expect(res.statusCode).toBe(200);
    const run = await broken.pool.query('select state from public.workflow_runs where id = $1', [runId]);
    expect(run.rows[0].state.attachments[0].observation).toContain('no extractable text layer');
  } finally {
    await broken.pool.query('delete from public.ai_chats where run_id = $1', [runId]);
    await broken.pool.query('delete from public.workflow_runs where id = $1', [runId]);
    await broken.close();
  }
});

test('an unreachable model still lets the upload succeed', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue(
    new Error('ollama down'), // the attachment stage fails
    { reply: 'Got your photo.', complete: false, redFlag: false, fields: nullFields });
  const { payload, headers } = multipart('rash.png', 'image/png', Buffer.from('89504e470d0a1a0a', 'hex'));
  const res = await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/upload`, headers: { ...auth(), ...headers }, payload,
  });
  expect(res.statusCode).toBe(200);
  const run = await ctx.pool.query('select state from public.workflow_runs where id = $1', [runId]);
  expect(run.rows[0].state.attachments[0].observation).toContain('AI was unavailable');
});

test('the upload turn is marked kind: upload in the transcript', async () => {
  const { runId } = await start();
  ctx.ollama.enqueue(
    { observation: 'A photograph of a forearm rash.' },
    { reply: 'Thanks.', complete: false, redFlag: false, fields: nullFields });
  const { payload, headers } = multipart('rash.png', 'image/png', Buffer.from('89504e470d0a1a0a', 'hex'));
  await ctx.app.inject({
    method: 'POST', url: `/consult/${runId}/upload`, headers: { ...auth(), ...headers }, payload,
  });
  const chat = await ctx.pool.query('select messages from public.ai_chats where run_id = $1', [runId]);
  const uploadTurn = chat.rows[0].messages.find(
    (m: { role: string; kind?: string }) => m.role === 'user' && m.kind === 'upload');
  expect(uploadTurn).toBeDefined();
});
