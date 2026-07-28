export interface SseFrame {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export type ReconnectingStreamState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

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

export class HttpTransportError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'HttpTransportError';
  }
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  revision?: string;
}

export function createHttpTransport(options: {
  baseUrl: string;
  fetch?: typeof fetch;
  authorizationHeaders?: () => Record<string, string>;
}) {
  const fetcher = (input: RequestInfo | URL, init?: RequestInit) => (options.fetch || globalThis.fetch)(input, init);
  const raw = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (init.body != null && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
    for (const [key, value] of Object.entries(options.authorizationHeaders?.() || {})) headers.set(key, value);
    const response = await fetcher(`${options.baseUrl}${path}`, { ...init, headers });
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
    );
  };
  const execute = async <T>(path: string, init: RequestInit = {}): Promise<HttpResponse<T>> => {
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
    async json<T = unknown>(path: string, init?: RequestInit) { return (await execute<T>(path, init)).data; },
    async result<T = unknown>(path: string, init?: RequestInit) {
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
