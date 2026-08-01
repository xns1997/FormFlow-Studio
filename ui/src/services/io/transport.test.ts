import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeReconnectingStream, createHttpTransport, HttpTransportError, parseSseStream, type SseFrame } from './transport';

test('transport exposes structured HTTP failures through one error interface', async () => {
  const transport = createHttpTransport({
    baseUrl: '/api',
    fetch: async () => new Response(JSON.stringify({ code: 'PROJECT_REVISION_CONFLICT', error: '项目已变化', currentRevision: 'r2' }), {
      status: 409,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
    }),
  });
  await assert.rejects(() => transport.json('/projects/p1'), (error: unknown) => {
    assert.ok(error instanceof HttpTransportError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'PROJECT_REVISION_CONFLICT');
    assert.equal(error.requestId, 'req-1');
    return true;
  });
});

test('SSE parser supports event id and multi-line data frames', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('id: 7\nevent: update\ndata: {"message":"first",\ndata: "value":2}\n\n'));
      controller.close();
    },
  });
  const frames: SseFrame[] = [];
  for await (const frame of parseSseStream(stream)) frames.push(frame);
  assert.deepEqual(frames, [{ id: '7', event: 'update', data: '{"message":"first",\n"value":2}' }]);
});

test('reconnecting stream resumes from the last acknowledged cursor', async () => {
  const controller = new AbortController();
  const opens: number[] = [];
  const received: number[] = [];
  await consumeReconnectingStream<number>({
    signal: controller.signal,
    cursor: 4,
    retryDelay: () => 0,
    open: async (cursor) => {
      opens.push(cursor);
      async function* items() {
        if (opens.length === 1) yield 5;
        else {
          yield 6;
          controller.abort();
        }
      }
      return items();
    },
    onItem: (item) => {
      received.push(item);
      return item;
    },
  });
  assert.deepEqual(opens, [4, 5]);
  assert.deepEqual(received, [5, 6]);
});

test('transport retries safe transient failures and preserves the request idempotency key', async () => {
  let attempts = 0;
  const seenKeys: string[] = [];
  const transport = createHttpTransport({
    baseUrl: '/api',
    fetch: async (_input, init) => {
      attempts += 1;
      seenKeys.push(new Headers(init?.headers).get('x-idempotency-key') || '');
      if (attempts < 3) return new Response(JSON.stringify({ error: 'temporarily unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    retry: { maxAttempts: 3, baseDelayMs: 0 },
  });

  const result = await transport.json('/projects/p1', {
    method: 'PUT',
    headers: { 'x-idempotency-key': 'same-key' },
    body: JSON.stringify({ name: 'p1' }),
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 3);
  assert.deepEqual(seenKeys, ['same-key', 'same-key', 'same-key']);
});

test('transport times out without retrying a non-idempotent mutation', async () => {
  let attempts = 0;
  const transport = createHttpTransport({
    baseUrl: '/api',
    fetch: async () => {
      attempts += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
    timeoutMs: 5,
    retry: { maxAttempts: 3, baseDelayMs: 0 },
  });

  await assert.rejects(() => transport.json('/projects/p1', { method: 'POST', body: '{}' }), /请求超时/);
  assert.equal(attempts, 1);
});

test('transport exposes Retry-After metadata from transient responses', async () => {
  const transport = createHttpTransport({
    baseUrl: '/api',
    fetch: async () => new Response(JSON.stringify({ error: 'busy' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '3' } }),
    retry: { maxAttempts: 1 },
  });
  await assert.rejects(() => transport.json('/health'), (error: unknown) => {
    assert.ok(error instanceof HttpTransportError);
    assert.equal(error.retryAfterMs, 3000);
    return true;
  });
});
