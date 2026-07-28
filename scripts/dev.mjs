// AppointMed demo stack: verifies Ollama, materializes service .env files,
// preflights the three demo ports, then runs adapter (:8090), engine (:8080)
// and the web portal (:5173) with prefixed output. Ctrl+C stops everything.
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const REQUIRED_MODEL = 'gemma4:12b';
const PORTS = [
  { port: 8090, name: 'adapter' },
  { port: 8080, name: 'engine' },
  { port: 5173, name: 'web' },
];

async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(4000) });
    const { models } = await res.json();
    const names = models.map((m) => m.name);
    if (!names.some((n) => n.startsWith(REQUIRED_MODEL))) {
      console.warn(`⚠ Ollama is up but ${REQUIRED_MODEL} is missing (have: ${names.join(', ')}). Run: ollama pull ${REQUIRED_MODEL}`);
    } else {
      console.log(`✓ Ollama ready (${REQUIRED_MODEL})`);
    }
  } catch {
    console.warn(`⚠ Ollama not reachable at ${OLLAMA_URL} — the engine will degrade to fallbacks. Start it with: ollama serve`);
  }
}

function materializeEnv(dir) {
  const env = path.join(root, dir, '.env');
  const example = path.join(root, dir, '.env.example');
  if (!existsSync(env) && existsSync(example)) {
    copyFileSync(example, env);
    console.log(`✓ ${dir}/.env created from .env.example`);
  }
}

// Is `port` free to bind right now? Same wildcard host (0.0.0.0) the real
// services use, so this matches what their own app.listen() will hit.
function checkPortFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });
}

// Best-effort only: name the process already holding `port`, so a preflight
// failure says more than "something's on 8080". Windows-only (netstat/tasklist
// parsing); returns null on any failure, including on non-Windows platforms -
// the preflight message still works without it, just without the process name.
function describePortHolder(port) {
  if (process.platform !== 'win32') return null;
  try {
    const netstatOut = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    const line = netstatOut.split('\n').find((l) => {
      const cols = l.trim().split(/\s+/);
      return cols[0] === 'TCP' && cols[1]?.endsWith(`:${port}`) && cols[3] === 'LISTENING';
    });
    if (!line) return null;
    const pid = line.trim().split(/\s+/).pop();
    try {
      const csv = execFileSync('tasklist', ['/fi', `PID eq ${pid}`, '/fo', 'csv', '/nh'], { encoding: 'utf8' });
      const name = csv.split(',')[0]?.replace(/"/g, '').trim();
      return name ? `${name} (pid ${pid})` : `pid ${pid}`;
    } catch {
      return `pid ${pid}`;
    }
  } catch {
    return null;
  }
}

// Abort before spawning anything if a demo port is already taken - otherwise
// the child that loses the bind (typically the engine on 8080) dies with
// EADDRINUSE seconds into startup and the fixed-delay banner below would have
// no way to know, printing success over a dead service.
async function preflightPorts() {
  const problems = [];
  for (const { port, name } of PORTS) {
    if (await checkPortFree(port)) continue;
    const holder = describePortHolder(port);
    problems.push(`  :${port} (${name}) - already in use${holder ? ` by ${holder}` : ''}`);
  }
  if (problems.length) {
    console.error(`\n✗ Cannot start the demo stack - port(s) already occupied:\n${problems.join('\n')}\n`);
    console.error('Free the port(s) above (or stop whatever is holding them) and re-run npm run dev.');
    process.exit(1);
  }
}

const services = [];
function run(name, dir, args, color) {
  // spawn(cmd, argsArray, {shell:true}) makes Node itself concatenate args
  // into the shell command line and warn about it (DEP0190) - printed
  // unprefixed, straight to our stderr, ahead of the pipe() below. Passing
  // the already-joined command as a single string sidesteps the warning;
  // behavior is unchanged since `npm`/args here are fixed literals, not
  // external input.
  const child = spawn(['npm', ...args].join(' '), { cwd: path.join(root, dir), shell: true });
  const rec = { name, child, alive: true, exitCode: null };
  const prefix = `\x1b[${color}m[${name}]\x1b[0m`;
  const pipe = (stream) => stream.on('data', (d) =>
    String(d).split('\n').filter(Boolean).forEach((l) => console.log(`${prefix} ${l}`)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code) => {
    rec.alive = false;
    rec.exitCode = code;
    console.log(`${prefix} exited (${code})`);
  });
  services.push(rec);
}

function killTree(child) {
  // child is `npm ... ` spawned with shell:true, i.e. a cmd.exe wrapping npm
  // wrapping the real server (tsx/vite) process. On Windows, child.kill()
  // only terminates that cmd.exe and orphans the actual server underneath it
  // (verified empirically — the port stays bound after a plain kill()).
  // taskkill /t kills the whole process tree rooted at that pid instead.
  if (process.platform === 'win32') {
    try {
      // stdio: 'ignore' - otherwise taskkill against an already-exited pid
      // (e.g. the engine after an EADDRINUSE crash) inherits our stderr and
      // prints an unprefixed "ERROR: The process ... not found." straight
      // through, ahead of the pipe() output above.
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } catch {
      // already exited — fine
    }
  } else {
    // Known limitation, not fixed here: this has the same bug the Windows
    // branch above works around. child is `npm ...` spawned with shell:true
    // (sh -c "npm ..."), so child.kill() only signals that shell, not the
    // npm → tsx/vite descendants actually holding the port - one of them can
    // survive as an orphan, same as the Windows case before taskkill /t was
    // added. A real fix needs the child spawned with `detached: true` and a
    // process-group kill (`process.kill(-child.pid)`), which needs a POSIX
    // machine to verify; this dev environment is Windows-only, so it isn't
    // done here rather than shipping an unverified change.
    child.kill();
  }
}

process.on('SIGINT', () => {
  console.log('\nStopping stack…');
  for (const s of services) killTree(s.child);
  process.exit(0);
});

await checkOllama();
await preflightPorts();
materializeEnv('appointmed_hospital_adapter');
materializeEnv('appointmed_engine');

run('adapter', 'appointmed_hospital_adapter', ['start'], '35');
run('engine', 'appointmed_engine', ['start'], '36');
run('web', 'appointmed_website', ['run', 'dev'], '33');

setTimeout(() => {
  const dead = services.filter((s) => !s.alive);
  if (dead.length) {
    console.error(`\n✗ demo stack failed to come up - ${dead.map((s) => `${s.name} exited (${s.exitCode})`).join(', ')}.`);
    console.error('See the prefixed output above for that service\'s own error. Stopping the rest of the stack.');
    for (const s of services) if (s.alive) killTree(s.child);
    process.exit(1);
  }
  console.log(`
──────────────────────────────────────────────────────
 AppointMed demo stack
   Engine   http://localhost:8080/health
   Adapter  http://localhost:8090/health
   Portal   http://localhost:5173
   Mobile   flutter run (emulator reaches engine at 10.0.2.2:8080)

 Demo accounts
   Patient  patient@appointmed.demo  / AppointMed!2026
   Manager  manager@appointmed.demo  / AppointMed!2026

 Refresh rolling demo slots any time: npm run db:seed
──────────────────────────────────────────────────────`);
}, 2500);
