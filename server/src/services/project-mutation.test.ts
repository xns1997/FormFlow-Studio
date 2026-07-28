import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProjectMutationModule, ProjectMutationError } from './project-mutation';
import { createFileProjectMutationReplayStore } from './project-mutation-replay-store';

function fixture() {
  let project: any = { config: { id: 'p1', updatedAt: 'v1' }, workflows: [], globalBehaviors: [] };
  let commits = 0;
  const mutation = createProjectMutationModule({
    read: () => structuredClone(project),
    revision: (value) => value.config.updatedAt,
    canAccess: (user, _value, access) => user?.id === 'owner' && access === 'edit',
    commit: (value) => {
      commits += 1;
      project = structuredClone(value);
      project.config.updatedAt = `v${commits + 1}`;
      return { project: structuredClone(project), revision: project.config.updatedAt };
    },
    remove: () => {
      project = null;
    },
  });
  return { mutation, project: () => project, commits: () => commits };
}

test('project mutation enforces access and base revision before invoking the change', () => {
  const state = fixture();
  let invoked = false;
  assert.throws(() => state.mutation.apply({
    projectId: 'p1', operation: 'workflow.create', baseRevision: 'v1', idempotencyKey: 'change-1', user: { id: 'other' }, access: 'edit',
    change: () => { invoked = true; },
  }), (error: unknown) => error instanceof ProjectMutationError && error.code === 'FORBIDDEN');
  assert.equal(invoked, false);
  assert.throws(() => state.mutation.apply({
    projectId: 'p1', operation: 'workflow.create', baseRevision: 'stale', idempotencyKey: 'change-2', user: { id: 'owner' }, access: 'edit',
    change: () => { invoked = true; },
  }), (error: unknown) => error instanceof ProjectMutationError && error.code === 'PROJECT_REVISION_CONFLICT');
  assert.equal(invoked, false);
});

test('project creation and deletion use the same idempotent mutation boundary', () => {
  let project: any = null;
  let commits = 0;
  let removals = 0;
  const mutation = createProjectMutationModule({
    read: () => project && structuredClone(project),
    revision: (value) => value.config.updatedAt,
    canAccess: () => true,
    commit: (value) => {
      commits += 1;
      project = structuredClone(value);
      return { project, revision: value.config.updatedAt };
    },
    remove: () => {
      removals += 1;
      project = null;
    },
  });
  const next = { config: { id: 'created', updatedAt: 'v1' } };
  const createCommand = {
    projectId: 'created', operation: 'project.create', payload: next,
    idempotencyKey: 'create-once', project: next, data: next,
  };
  const created = mutation.create(createCommand);
  assert.deepEqual(mutation.create(createCommand), created);
  assert.equal(commits, 1);
  const removeCommand = {
    projectId: 'created', operation: 'project.delete', payload: { id: 'created' },
    baseRevision: 'v1', idempotencyKey: 'remove-once', access: 'manage' as const,
    data: { success: true },
  };
  const removed = mutation.remove(removeCommand);
  assert.deepEqual(mutation.remove(removeCommand), removed);
  assert.equal(removals, 1);
});

test('project mutation commits once and replays the same idempotency key', () => {
  const state = fixture();
  const command = {
    projectId: 'p1', operation: 'workflow.create', payload: { id: 'wf-1' }, baseRevision: 'v1', idempotencyKey: 'workflow-add', user: { id: 'owner' }, access: 'edit' as const,
    change: (project: any) => { project.workflows.push({ id: 'wf-1' }); return { workflowId: 'wf-1' }; },
  };
  const first = state.mutation.apply(command);
  const replay = state.mutation.apply(command);
  assert.equal(state.commits(), 1);
  assert.deepEqual(replay, first);
  assert.deepEqual(state.project().workflows, [{ id: 'wf-1' }]);
});

test('project mutation rejects reusing an idempotency key for different input', () => {
  const state = fixture();
  const base = {
    projectId: 'p1', operation: 'workflow.create', baseRevision: 'v1',
    idempotencyKey: 'shared-key', user: { id: 'owner' }, access: 'edit' as const,
  };
  state.mutation.apply({ ...base, payload: { id: 'wf-1' }, change: (project) => project.workflows.push({ id: 'wf-1' }) });
  assert.throws(
    () => state.mutation.apply({ ...base, operation: 'workflow.delete', payload: { id: 'wf-1' }, change: () => undefined }),
    (error: unknown) => error instanceof ProjectMutationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );
  assert.equal(state.commits(), 1);
});

test('idempotent replay survives reconstructing the mutation module', () => {
  const directory = mkdtempSync(join(tmpdir(), 'formflow-mutation-replay-'));
  try {
    let project: any = { config: { id: 'p1', updatedAt: 'v1' }, workflows: [] };
    let commits = 0;
    const adapters = {
      read: () => structuredClone(project),
      revision: (value: any) => value.config.updatedAt,
      canAccess: () => true,
      commit: (value: any) => {
        commits += 1;
        project = structuredClone(value);
        project.config.updatedAt = 'v2';
        return { project, revision: 'v2' };
      },
    };
    const replayStore = createFileProjectMutationReplayStore(join(directory, 'replays.json'));
    const command = {
      projectId: 'p1', operation: 'workflow.create', payload: { id: 'wf-1' },
      baseRevision: 'v1', idempotencyKey: 'restart-safe', access: 'edit' as const,
      change: (draft: any) => { draft.workflows.push({ id: 'wf-1' }); return { id: 'wf-1' }; },
    };
    const first = createProjectMutationModule(adapters, replayStore).apply(command);
    const replay = createProjectMutationModule(adapters, replayStore).apply(command);
    assert.deepEqual(replay, first);
    assert.equal(commits, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
