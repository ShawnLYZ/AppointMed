// Env-driven config. The committed `YOUR_...` default is a PLACEHOLDER, not a
// working credential — fill it in once in `appointmed_hospital_adapter/.env`
// (copy `.env.example`). See README §6 Part D.
export const config = {
  port: Number(process.env.PORT ?? 8090),
  // Use the Session pooler string from the Supabase dashboard (Connect →
  // Session pooler), not "Direct connection": the direct host is IPv6-only and
  // is ENOTFOUND on many home networks.
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-1-YOUR_REGION.pooler.supabase.com:5432/postgres',
  engineUrl: process.env.ENGINE_URL ?? 'http://localhost:8080',
  // Shared localhost-only secret for the adapter → engine callback. Must match
  // POSTBACK_SECRET in appointmed_engine/.env. Change both for a real deployment.
  postbackSecret: process.env.POSTBACK_SECRET ?? 'appointmed-postback-demo-secret',
};

/**
 * Throws if DATABASE_URL is still a `YOUR_...` placeholder. Called on boot and
 * from the test bootstrap, so the failure names the file to fix rather than
 * surfacing later as an opaque ENOTFOUND.
 */
export function assertConfigured(): void {
  if (!config.databaseUrl.includes('YOUR_')) return;
  throw new Error(
    'appointmed-hospital-adapter is not configured: DATABASE_URL still holds a placeholder value.\n' +
    'Fix: copy appointmed_hospital_adapter/.env.example to appointmed_hospital_adapter/.env and paste your own Supabase connection string into it.\n' +
    'Where to get it: README.md §6 Part C (collect the values) and Part D (paste them in).',
  );
}
