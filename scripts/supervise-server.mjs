import { spawn } from 'node:child_process';

const command = process.argv[2];
const args = process.argv.slice(3);
if (!command) throw new Error('用法：node scripts/supervise-server.mjs <command> [args...]');

let stopping = false;
let child;
let failures = 0;
let restartTimer;
let resetTimer;

function start() {
  if (stopping) return;
  child = spawn(command, args, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  child.once('error', (error) => console.error(`[server-supervisor] failed to spawn child: ${error.message}`));
  const currentChild = child;
  child.once('exit', (code, signal) => {
    if (resetTimer) clearTimeout(resetTimer);
    if (child === currentChild) child = undefined;
    if (stopping) return;
    failures += 1;
    const delay = Math.min(60_000, 1_000 * 2 ** Math.min(failures - 1, 6)) + Math.floor(Math.random() * 250);
    console.error(`[server-supervisor] child exited (${code ?? signal}); restarting in ${delay}ms`);
    restartTimer = setTimeout(start, delay);
  });
  child.once('spawn', () => {
    resetTimer = setTimeout(() => { if (!stopping && child === currentChild) failures = 0; }, 5 * 60_000);
    resetTimer.unref();
  });
}

async function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  if (!child) { process.exit(0); return; }
  child.kill(signal);
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
start();
