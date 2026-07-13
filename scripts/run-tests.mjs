import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const roots = ['server/src', 'ui/src', 'ui/nodes'];
const files = [];
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (entry.name.endsWith('.test.ts')) files.push(path);
  }
};
for (const root of roots) visit(resolve(root));
files.sort();
const executable = resolve('node_modules/.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const result = spawnSync(executable, ['--test', ...files], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
