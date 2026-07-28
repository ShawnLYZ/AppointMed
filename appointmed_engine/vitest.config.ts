import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// The `npm test` script runs vitest directly, so it does not get the
// `--env-file-if-exists=.env` that `npm run dev`/`start` pass to tsx. Load the
// same .env here, before any test module imports src/config.ts, so one filled-in
// .env serves the running service and the suite alike (README §6 Part D).
if (existsSync('.env')) process.loadEnvFile('.env');

// Engine tests run against the hosted Supabase project. Each test file's
// `beforeAll` (makeTestContext) makes several pooler round-trips plus a GoTrue
// sign-in, which under SEA network latency can exceed vitest's 10s default hook
// timeout and fail spuriously (observed: beforeAll ~6-10s). Widen the hook and
// test timeouts so latency spikes don't produce false failures — a passing
// hook/test is unaffected. (--no-file-parallelism stays in the package.json
// test script; these timeouts are complementary.)
export default defineConfig({
  test: {
    hookTimeout: 30000,
    testTimeout: 15000,
  },
});
