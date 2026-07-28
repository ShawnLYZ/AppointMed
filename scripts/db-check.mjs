// Probes each DB URL candidate and reports the first that works.
import pg from 'pg';
import { DB_URL, DB_URL_CANDIDATES, assertConfigured } from './config.mjs';

assertConfigured();

const candidates = process.env.SUPABASE_DB_URL
  ? [process.env.SUPABASE_DB_URL]
  : [DB_URL, ...DB_URL_CANDIDATES.filter((u) => u !== DB_URL)];

let ok = false;
for (const url of candidates) {
  const redacted = url.replace(/:[^:@/]+@/, ':****@');
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    const { rows } = await client.query('select current_database() as db, version() as v');
    console.log(`OK  ${redacted}`);
    console.log(`    database=${rows[0].db}`);
    console.log(`    ${rows[0].v.split(',')[0]}`);
    if (url !== DB_URL) {
      console.log(`\nNOTE: the default DB_URL did not work. Set the working URL for all tools:`);
      console.log(`  $env:SUPABASE_DB_URL = "${url}"`);
    }
    ok = true;
    await client.end();
    break;
  } catch (err) {
    console.log(`FAIL ${redacted}\n     ${err.code ?? ''} ${err.message}`);
    await client.end().catch(() => {});
  }
}

if (!ok) {
  console.error(
    '\nNo candidate connected. Get the exact Session Pooler URL from the Supabase dashboard' +
      ' (Connect → Session pooler), URL-encode the password (@ → %40), and set SUPABASE_DB_URL.',
  );
  process.exit(1);
}
