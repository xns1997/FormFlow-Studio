import assert from 'node:assert/strict';
import test from 'node:test';
import { llmApi } from './api';

test('project agent SSE reports lifecycle and resumes after the last sequence', async () => {
  const originalFetch = globalThis.fetch; const calls: string[] = []; const lifecycle: string[] = []; const events: any[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls.push(String(input));
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"seq":42,"type":"task_started"}\n\n')); controller.close(); } });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  try {
    await llmApi.projectAgent.streamEvents('session one', 41, (event) => events.push(event), undefined, 'project one', { onOpen: () => lifecycle.push('open'), onClose: () => lifecycle.push('close') });
  } finally { globalThis.fetch = originalFetch; }
  assert.deepEqual(lifecycle, ['open', 'close']);
  assert.equal(events[0].seq, 42);
  assert.match(calls[0], /session%20one\/events\?afterSeq=41&projectId=project%20one/);
});

test('project agent session queries encode exact project, unbound and all scopes', async () => {
  const originalFetch = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => { calls.push(String(input)); return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
  try {
    await llmApi.projectAgent.sessions({ projectId: 'project one' });
    await llmApi.projectAgent.sessions({ scope: 'unbound' });
    await llmApi.projectAgent.sessions({ scope: 'all' });
  } finally { globalThis.fetch = originalFetch; }
  assert.match(calls[0], /sessions\?projectId=project\+one$/);
  assert.match(calls[1], /sessions\?scope=unbound$/);
  assert.match(calls[2], /sessions\?scope=all$/);
});
