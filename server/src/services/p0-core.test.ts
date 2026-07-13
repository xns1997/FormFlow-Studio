import assert from 'node:assert/strict';
import test from 'node:test';
import { signToken, verifyToken } from '../middleware/auth';
import { canAccessProject, setProjectMember } from './permission';
import { acquireProjectLock, getProjectLock, releaseProjectLock } from './project-lock';

test('JWT signs, verifies and rejects tampering', () => {
  const user = { id: 'u1', username: 'editor', role: 'editor' as const };
  const token = signToken(user, 60);
  assert.deepEqual(verifyToken(token), user);
  assert.equal(verifyToken(`${token}x`), undefined);
});

test('project ACL grants only declared capabilities', () => {
  const project: any = { config: { access: { ownerId: 'owner', members: {} } } };
  setProjectMember(project, 'viewer', ['view']);
  assert.equal(canAccessProject({ id: 'viewer', username: 'v', role: 'viewer' }, project, 'view'), true);
  assert.equal(canAccessProject({ id: 'viewer', username: 'v', role: 'viewer' }, project, 'edit'), false);
  assert.equal(canAccessProject({ id: 'owner', username: 'o', role: 'viewer' }, project, 'manage'), true);
});

test('project lock excludes another editor and validates release ownership', () => {
  const first = acquireProjectLock('p-lock-test', { id: 'u1', username: 'one' }, 30000);
  assert.ok(first);
  assert.equal(acquireProjectLock('p-lock-test', { id: 'u2', username: 'two' }, 30000), undefined);
  assert.equal(releaseProjectLock('p-lock-test', 'u2'), false);
  assert.equal(releaseProjectLock('p-lock-test', 'u1', first.token), true);
  assert.equal(getProjectLock('p-lock-test'), undefined);
});
