import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
export async function main(argv = process.argv.slice(2)) {
  const [command, name, ...rest] = argv;
  if (command === 'init') { await writeFile(resolve('formflow.config.json'), JSON.stringify({ server: 'http://localhost:3001', projectsDir: './projects/data' }, null, 2)); return console.log('Initialized formflow.config.json'); }
  if (command === 'create') { if (!name) throw new Error('用法: formflow create <name>'); const id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'); const root = resolve('projects/data', `${id}.formflow`); await mkdir(root, { recursive: true }); await writeFile(resolve(root, 'project.json'), JSON.stringify({ kind: 'formflow-project', formatVersion: 2, config: { id, name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, settings: {} }, null, 2)); return console.log(`Created ${id}`); }
  if (command === 'run') { if (!name) throw new Error('用法: formflow run <workflow>'); const server = process.env.FORMFLOW_SERVER || 'http://localhost:3001'; const response = await fetch(`${server}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, payload: { workflowId: name, variables: Object.fromEntries(rest.map((value) => value.split('='))) } }) }); if (!response.ok) throw new Error(await response.text()); return console.log(JSON.stringify(await response.json(), null, 2)); }
  if (command === 'deploy') return await new Promise((resolvePromise, reject) => { const child = spawn('docker', ['compose', 'up', '-d', '--build'], { stdio: 'inherit' }); child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`deploy failed: ${code}`))); });
  console.log('formflow init | create <name> | run <workflow> [key=value] | deploy');
}
