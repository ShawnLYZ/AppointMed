import { createClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildServer, type EngineDeps } from '../src/server.js';
import { makeSupabase } from '../src/supabase.js';
import { assertConfigured, config } from '../src/config.js';
import { OllamaStub } from './stub-ollama.js';
import { FakeAdapterClient } from './fake-adapter.js';

// The suite runs against the live hosted project, so it needs the same values
// the service does — including the anon key, to sign the test patient in.
// vitest.config.ts loads appointmed_engine/.env before this module is imported.
assertConfigured(true);
export const ANON_KEY = config.supabaseAnonKey;

export const ENGINE_FIX = {
  password: 'RlsTest!2026',
  patient: 'engine-patient@test.appointmed.demo',
  hospitalA: 'f0000000-0000-4000-8000-000000000001',
  hospitalB: 'f0000000-0000-4000-8000-000000000002',
  // These two api_key values are shared with the adapter suite
  // (appointmed_hospital_adapter/test/fixtures.ts) and with supabase/tests.
  // Their row ids must match that file's apiKeyIdA/apiKeyIdB: the adapter
  // inserts them `on conflict (id) do nothing`, so if this suite ran first and
  // created the same api_key under a *generated* id, the adapter's insert would
  // miss the id conflict and die on the api_key unique constraint instead.
  apiKeyIdA: 'f0000000-0000-4000-8000-0000000000a1',
  apiKeyIdB: 'f0000000-0000-4000-8000-0000000000b1',
  keyA: 'amk_rlstest_aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  keyB: 'amk_rlstest_bbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  specialistA: 'e1000000-0000-4000-8000-000000000001',
};

/**
 * The `summary` stage's decision, now generated at triage instead of at
 * booking. Byte-identical across every test file that drives a run through
 * triage (triage, booking, match, postback, respond, upload), so it is
 * defined once here rather than six times locally - unlike completeIntake /
 * cardiologyVerdict / anyPrefs, which differ slightly per file and stay put.
 */
export const caseReport = () => ({
  summary: 'Exertional chest tightness, 2 weeks, severity 6/10, hypertensive on amlodipine.',
  chiefComplaint: 'Chest tightness on exertion',
  historyOfPresentIllness: 'Two weeks of chest tightness brought on by exertion, rated 6/10, with breathlessness climbing stairs.',
  associatedSymptoms: 'Breathlessness on stairs',
  pastMedicalHistory: 'Hypertension',
  currentMedications: 'Amlodipine',
  attachmentFindings: 'No files were uploaded.',
  triageAssessment: 'Cardiology within a week.',
  redFlags: [],
  clinicianNotes: 'Consider ECG at first contact.',
  priority: 'medium',
});

export interface TestContext {
  app: FastifyInstance;
  pool: pg.Pool;
  ollama: OllamaStub;
  adapter: FakeAdapterClient;
  token: string;
  userId: string;
  close: () => Promise<void>;
}

export async function makeTestContext(
  overrides: { extractPdfText?: EngineDeps['extractPdfText'] } = {},
): Promise<TestContext> {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 3 });
  const supabase = makeSupabase(config.supabaseUrl, config.supabaseServiceRoleKey);

  // ensure test patient
  let userId: string;
  const existing = await pool.query('select id from auth.users where email = $1', [ENGINE_FIX.patient]);
  if (existing.rows.length > 0) {
    userId = existing.rows[0].id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ENGINE_FIX.patient, password: ENGINE_FIX.password, email_confirm: true,
      app_metadata: { role: 'patient' }, user_metadata: { full_name: 'Engine Test Patient' },
    });
    if (error) throw new Error(error.message);
    userId = data.user.id;
  }
  // ensure Phase-1 test hospitals + api keys exist (engine tests may run on a fresh DB)
  await pool.query(
    `insert into public.hospitals (id, name, address) values
       ($1, 'RLS Test Hospital A', '1 Test Street'),
       ($2, 'RLS Test Hospital B', '2 Test Street')
     on conflict (id) do nothing`,
    [ENGINE_FIX.hospitalA, ENGINE_FIX.hospitalB],
  );
  await pool.query(
    `insert into public.hospital_api_keys (id, hospital_id, api_key, label) values
       ($1, $2, $3, 'rls-test'), ($4, $5, $6, 'rls-test')
     on conflict (api_key) do nothing`,
    [
      ENGINE_FIX.apiKeyIdA, ENGINE_FIX.hospitalA, ENGINE_FIX.keyA,
      ENGINE_FIX.apiKeyIdB, ENGINE_FIX.hospitalB, ENGINE_FIX.keyB,
    ],
  );
  // ensure fixture specialist for FK integrity of appointments.specialist_id
  await pool.query(
    `insert into public.specialists (id, hospital_id, full_name, specialty, price, is_active)
     values ($1, $2, 'Dr. Engine Cardio', 'Cardiology', 150.00, true)
     on conflict (id) do nothing`,
    [ENGINE_FIX.specialistA, ENGINE_FIX.hospitalA],
  );

  const anon = createClient(config.supabaseUrl, ANON_KEY, { auth: { persistSession: false } });
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
    email: ENGINE_FIX.patient, password: ENGINE_FIX.password,
  });
  if (signInErr) throw new Error(signInErr.message);

  const ollama = new OllamaStub();
  const adapter = new FakeAdapterClient();
  const deps: EngineDeps = {
    pool, supabase, ollama, adapter,
    extractPdfText: overrides.extractPdfText ?? (async () => 'FAKE-PDF-TEXT'),
  };
  const app = buildServer(deps);
  return {
    app, pool, ollama, adapter, userId,
    token: session.session!.access_token,
    close: async () => { await app.close(); await pool.end(); },
  };
}
