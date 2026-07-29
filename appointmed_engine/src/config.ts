// Every value is env-overridable; the committed defaults below that read
// `YOUR_...` are PLACEHOLDERS, not working credentials. Fill them in once in
// `appointmed_engine/.env` (copy `.env.example`) — see README §6 Part D.
// assertConfigured() below turns a forgotten placeholder into a readable error
// instead of a confusing DNS/auth failure ten seconds into a request.
const d = (v: string | undefined, def: string) => v ?? def;
const modelDefault = d(process.env.MODEL_DEFAULT, 'gemma4:12b');

export const config = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: d(process.env.DATABASE_URL,
    'postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-1-YOUR_REGION.pooler.supabase.com:5432/postgres'),
  supabaseUrl: d(process.env.SUPABASE_URL, 'https://YOUR_PROJECT_REF.supabase.co'),
  // Public key. Only used to sign test users in; the server itself never needs it.
  supabaseAnonKey: d(process.env.SUPABASE_ANON_KEY, 'YOUR_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: d(process.env.SUPABASE_SERVICE_ROLE_KEY, 'YOUR_SUPABASE_SERVICE_ROLE_KEY'),
  adapterUrl: d(process.env.ADAPTER_URL, 'http://localhost:8090'),
  // Shared localhost-only secret for the adapter → engine callback. Not a
  // credential to any external service; change it for any real deployment.
  postbackSecret: d(process.env.POSTBACK_SECRET, 'appointmed-postback-demo-secret'),
  ollamaUrl: d(process.env.OLLAMA_URL, 'http://localhost:11434'),
  models: {
    intake: d(process.env.MODEL_INTAKE, modelDefault),
    triage: d(process.env.MODEL_TRIAGE, modelDefault),
    prefs: d(process.env.MODEL_PREFS, modelDefault),
    relax: d(process.env.MODEL_RELAX, modelDefault),
    summary: d(process.env.MODEL_SUMMARY, modelDefault),
    // Must be a vision-capable model - this stage receives images.
    attachment: d(process.env.MODEL_ATTACHMENT, modelDefault),
  },
  fallbackModel: d(process.env.MODEL_FALLBACK, 'qwen3.5:9b'),
};

/** Env vars whose value must be supplied before the engine can reach a database. */
const REQUIRED: ReadonlyArray<[string, string]> = [
  ['DATABASE_URL', config.databaseUrl],
  ['SUPABASE_URL', config.supabaseUrl],
  ['SUPABASE_SERVICE_ROLE_KEY', config.supabaseServiceRoleKey],
];

/**
 * Throws if any required value is still a `YOUR_...` placeholder. Called on
 * boot (src/index.ts) and from the test bootstrap, so the failure names the
 * variable and the file to fix rather than surfacing as ENOTFOUND.
 */
export function assertConfigured(anonKeyToo = false): void {
  const checks = anonKeyToo
    ? [...REQUIRED, ['SUPABASE_ANON_KEY', config.supabaseAnonKey] as [string, string]]
    : REQUIRED;
  const missing = checks.filter(([, v]) => v.includes('YOUR_')).map(([k]) => k);
  if (!missing.length) return;
  throw new Error(
    `appointmed-engine is not configured: ${missing.join(', ')} still ${missing.length > 1 ? 'hold' : 'holds'} a placeholder value.\n` +
    `Fix: copy appointmed_engine/.env.example to appointmed_engine/.env and paste your own Supabase values into it.\n` +
    `Where to get them: README.md §6 Part C (collect the values) and Part D (paste them in).`,
  );
}
