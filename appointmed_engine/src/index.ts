import { assertConfigured, config } from './config.js';
import { makePool } from './db.js';
import { makeSupabase } from './supabase.js';
import { OllamaHttpClient } from './ollama/client.js';
import { HttpAdapterClient } from './tools/adapter.js';
import { extractPdfText } from './tools/files.js';
import { buildServer } from './server.js';

// Fail here, with a message naming the file to fix, rather than ten seconds
// later inside a request with an opaque ENOTFOUND.
try {
  assertConfigured();
} catch (err) {
  console.error(`appointmed-engine failed to start:\n${(err as Error).message}`);
  process.exit(1);
}

const app = buildServer({
  pool: makePool(config.databaseUrl),
  supabase: makeSupabase(config.supabaseUrl, config.supabaseServiceRoleKey),
  ollama: new OllamaHttpClient({ url: config.ollamaUrl, models: config.models, fallbackModel: config.fallbackModel }),
  adapter: new HttpAdapterClient(config.adapterUrl),
  extractPdfText,
});

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  console.log(`appointmed-engine listening on :${config.port} (ollama: ${config.ollamaUrl}, adapter: ${config.adapterUrl})`);
}).catch((err) => {
  const reason = err?.code === 'EADDRINUSE' ? `port ${config.port} is already in use` : (err?.message ?? String(err));
  console.error(`appointmed-engine failed to start: ${reason}`);
  process.exit(1);
});
