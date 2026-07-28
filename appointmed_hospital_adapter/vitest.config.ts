import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// The `npm test` script runs vitest directly, so it does not get the
// `--env-file-if-exists=.env` that `npm run dev`/`start` pass to tsx. Load the
// same .env here, before any test module imports src/config.ts, so one filled-in
// .env serves the running service and the suite alike (README §6 Part D).
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({});
