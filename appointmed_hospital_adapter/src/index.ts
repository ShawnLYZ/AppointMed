import { assertConfigured, config } from './config.js';
import { makePool } from './db.js';
import { makeHttpPostbackSender } from './postback.js';
import { buildServer } from './server.js';

// Fail here, with a message naming the file to fix, rather than later inside a
// request with an opaque ENOTFOUND.
try {
  assertConfigured();
} catch (err) {
  console.error(`appointmed-hospital-adapter failed to start:\n${(err as Error).message}`);
  process.exit(1);
}

const app = buildServer({
  pool: makePool(config.databaseUrl),
  postback: makeHttpPostbackSender(config.engineUrl, config.postbackSecret),
});

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  console.log(`appointmed-hospital-adapter listening on :${config.port}`);
}).catch((err) => {
  const reason = err?.code === 'EADDRINUSE' ? `port ${config.port} is already in use` : (err?.message ?? String(err));
  console.error(`appointmed-hospital-adapter failed to start: ${reason}`);
  process.exit(1);
});
