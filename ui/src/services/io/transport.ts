export interface SseFrame {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export type ReconnectingStreamState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RetryPolicy {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface TransportRequestInit extends RequestInit {
  queueWhenOffline?: boolean;
  baseRevision?: string;
  /** Per-request timeout override; falls back to the transport default. */
  timeoutMs?: number;
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/** 消费断线重连流（SSE/事件流）。 */
export async function consumeReconnectingStream<T>(options: {
  signal: AbortSignal;
  cursor: number;
  open(cursor: number, signal: AbortSignal): Promise<AsyncIterable<T>>;
  onItem(item: T, cursor: number): number | void;
  onState?(state: ReconnectingStreamState): void;
  retryDelay?(failures: number): number;
}) {
  let cursor = options.cursor;
  let failures = 0;
  while (!options.signal.aborted) {
    options.onState?.(failures ? 'reconnecting' : 'connecting');
    try {
      const items = await options.open(cursor, options.signal);
      failures = 0;
      options.onState?.('connected');
      for await (const item of items) {
        if (options.signal.aborted) break;
        cursor = options.onItem(item, cursor) ?? cursor;
      }
      if (options.signal.aborted) break;
      failures += 1;
    } catch {
      if (options.signal.aborted) break;
      failures += 1;
    }
    options.onState?.(failures >= 3 ? 'disconnected' : 'reconnecting');
    await abortableDelay(
      options.retryDelay?.(failures) ?? Math.min(5_000, 1_000 * 2 ** failures),
      options.signal,
    );
  }
  return cursor;
}

/** 解析 SSE 字节流为帧序列。 */
export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = done ? '' : frames.pop() || '';
      for (const source of frames) {
        const frame: SseFrame = { data: '' };
        const data: string[] = [];
        for (const line of source.split(/\r?\n/)) {
          if (!line || line.startsWith(':')) continue;
          const separator = line.indexOf(':');
          const field = separator < 0 ? line : line.slice(0, separator);
          const raw = separator < 0 ? '' : line.slice(separator + 1);
          const valueText = raw.startsWith(' ') ? raw.slice(1) : raw;
          if (field === 'data') data.push(valueText);
          else if (field === 'id') frame.id = valueText;
          else if (field === 'event') frame.event = valueText;
          else if (field === 'retry' && /^\d+$/.test(valueText)) frame.retry = Number(valueText);
        }
        frame.data = data.join('\n');
        if (data.length) yield frame;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

/** HTTP 传输错误（含状态码）。 */
export class HttpTransportError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'HttpTransportError';
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  revision?: string;
}

/** 创建 HTTP 传输（请求/流式/离线队列）。 */
export function createHttpTransport(options: {
  baseUrl: string;
  fetch?: typeof fetch;
  authorizationHeaders?: () => Record<string, string>;
  timeoutMs?: number;
  retry?: RetryPolicy;
  offlineQueue?: (request: { path: string; init: TransportRequestInit }) => Promise<void>;
}) {
  const fetcher = (input: RequestInfo | URL, init?: RequestInit) => (options.fetch || globalThis.fetch)(input, init);
  const retryDefaults = { maxAttempts: 3, baseDelayMs: 250, maxDelayMs: 5_000, ...options.retry };
  const retryableStatuses = new Set([408, 425, 429, 502, 503, 504]);
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const isRetryableRequest = (init: TransportRequestInit) => {
    const method = String(init.method || 'GET').toUpperCase();
    if (safeMethods.has(method)) return true;
    const headers = new Headers(init.headers);
    return headers.has('x-idempotency-key') && (init.body == null || typeof init.body === 'string');
  };
  const fetchOnce = async (path: string, init: TransportRequestInit, timeoutMs?: number) => {
    const headers = new Headers(init.headers);
    if (init.body != null && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
    for (const [key, value] of Object.entries(options.authorizationHeaders?.() || {})) headers.set(key, value);
    const controller = new AbortController();
    const timer = timeoutMs && timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
    const onAbort = () => controller.abort();
    init.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await fetcher(`${options.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
      if (controller.signal.aborted && !init.signal?.aborted) throw new Error('请求超时');
      if (response.ok) return response;
      const contentType = response.headers.get('content-type') || '';
      const body = response.status === 204
        ? undefined
        : contentType.includes('json')
          ? await response.json().catch(() => undefined)
          : await response.text().catch(() => undefined);
      const detail = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      throw new HttpTransportError(
        String(detail.error || detail.message || `HTTP ${response.status}`),
        response.status,
        typeof detail.code === 'string' ? detail.code : undefined,
        body,
        response.headers.get('x-request-id') || undefined,
        parseRetryAfter(response.headers.get('retry-after')),
      );
    } catch (error) {
      if (controller.signal.aborted && !init.signal?.aborted) throw new Error('请求超时');
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }
  };
  const raw = async (path: string, init: TransportRequestInit = {}) => {
    const canRetry = isRetryableRequest(init);
    const maxAttempts = canRetry ? Math.max(1, retryDefaults.maxAttempts) : 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchOnce(path, init, init.timeoutMs || options.timeoutMs);
        return response;
      } catch (error) {
        lastError = error;
        const retryable = error instanceof HttpTransportError
          ? retryableStatuses.has(error.status)
          : !(error instanceof Error && error.message === '请求超时') && !init.signal?.aborted;
        if (!retryable || attempt >= maxAttempts) {
          if (init.queueWhenOffline && canRetry && options.offlineQueue && (error instanceof TypeError || (error instanceof Error && error.message === '请求超时'))) {
            await options.offlineQueue({ path, init });
          }
          throw error;
        }
        const exponentialDelay = Math.min(retryDefaults.maxDelayMs, retryDefaults.baseDelayMs * 2 ** (attempt - 1));
        const retryAfter = error instanceof HttpTransportError ? error.retryAfterMs : undefined;
        const delay = Math.min(retryDefaults.maxDelayMs, retryAfter ?? exponentialDelay) + Math.floor(Math.random() * 100);
        await sleep(delay);
      }
    }
    throw lastError;
  };
  const execute = async <T>(path: string, init: TransportRequestInit = {}): Promise<HttpResponse<T>> => {
    const response = await raw(path, init);
    const contentType = response.headers.get('content-type') || '';
    const body = response.status === 204
      ? undefined
      : contentType.includes('json')
        ? await response.json().catch(() => undefined)
        : await response.text().catch(() => undefined);
    return {
      data: body as T,
      status: response.status,
      headers: response.headers,
      revision: response.headers.get('x-project-revision') || response.headers.get('etag')?.replace(/^W\//, '').replace(/^"|"$/g, '') || undefined,
    };
  };
  return {
    raw,
    response: execute,
    async json<T = unknown>(path: string, init?: TransportRequestInit) { return (await execute<T>(path, init)).data; },
    async result<T = unknown>(path: string, init?: TransportRequestInit) {
      try {
        const response = await execute<T>(path, init);
        return { status: response.status, ok: true as const, body: response.data, headers: response.headers };
      } catch (error) {
        if (!(error instanceof HttpTransportError)) throw error;
        return { status: error.status, ok: false as const, body: error.details, headers: new Headers() };
      }
    },
    async stream(path: string, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      headers.set('accept', 'text/event-stream');
      for (const [key, value] of Object.entries(options.authorizationHeaders?.() || {})) headers.set(key, value);
      const response = await fetcher(`${options.baseUrl}${path}`, { ...init, headers });
      if (!response.ok || !response.body) throw new HttpTransportError(`事件流连接失败：${response.status}`, response.status);
      return { response, frames: parseSseStream(response.body) };
    },
  };
}
