import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { resolvePythonExecutable } from './paths';

test('python executable prefers an explicit override', () => {
  assert.equal(resolvePythonExecutable('/opt/formflow/python', '/repo', 'linux', () => false), '/opt/formflow/python');
});

test('python executable uses the repository virtual environment when present', () => {
  const localPython = join('/repo', 'venv', 'bin', 'python3');
  assert.equal(resolvePythonExecutable(undefined, '/repo', 'linux', (path) => path === localPython), localPython);
});

test('python executable falls back to the system command on clean CI runners', () => {
  assert.equal(resolvePythonExecutable(undefined, '/repo', 'linux', () => false), 'python3');
  assert.equal(resolvePythonExecutable(undefined, 'C:\\repo', 'win32', () => false), 'python');
});
