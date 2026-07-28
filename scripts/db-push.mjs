// Non-interactive `supabase db push` against the hosted project.
import { spawnSync } from 'node:child_process';
import { DB_URL, assertConfigured } from './config.mjs';

assertConfigured();

const args =['supabase', 'db', 'push', '--db-url', DB_URL, ...process.argv.slice(2)];
console.log(`> npx ${args.join(' ').replace(/:[^:@/]+@/, ':****@')}`);

const res = spawnSync('npx', args, {
  input: 'Y\n', // answers the "Do you want to push these migrations?" prompt
  encoding: 'utf8',
  shell: true,  // required on Windows so npx resolves
});

process.stdout.write(res.stdout ?? '');
process.stderr.write(res.stderr ?? '');
process.exit(res.status ?? 1);
