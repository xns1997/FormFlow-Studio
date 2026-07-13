export interface RegexSampleResult {
  sample: string;
  matched: boolean;
  match?: string;
  groups: string[];
}

export interface RegexTestResult {
  ok: boolean;
  results: RegexSampleResult[];
  error?: string;
  timedOut?: boolean;
}

export const REGEX_EXAMPLES = [
  { category: '常用', label: '整数', pattern: '^-?\\d+$', sample: '123' },
  { category: '常用', label: '小数', pattern: '^-?\\d+(?:\\.\\d+)?$', sample: '12.50' },
  { category: '联系信息', label: '邮箱', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', sample: 'name@example.com' },
  { category: '联系信息', label: '中国大陆手机号', pattern: '^1[3-9]\\d{9}$', sample: '13800138000' },
  { category: '网络', label: 'HTTP(S) URL', pattern: '^https?://[^\\s]+$', sample: 'https://example.com' },
  { category: '标识符', label: '字段名', pattern: '^[A-Za-z_][A-Za-z0-9_]*$', sample: 'customer_name' },
] as const;

export function compileRegex(pattern: string, flags = ''): string | null {
  try { new RegExp(pattern, flags); return null; }
  catch (error) { return error instanceof Error ? error.message : String(error); }
}

function runSynchronously(pattern: string, flags: string, samples: string[]): RegexTestResult {
  const error = compileRegex(pattern, flags);
  if (error) return { ok: false, results: [], error };
  const regex = new RegExp(pattern, flags);
  return {
    ok: true,
    results: samples.map((sample) => {
      regex.lastIndex = 0;
      const match = regex.exec(sample);
      return { sample, matched: !!match, match: match?.[0], groups: match?.slice(1) || [] };
    }),
  };
}

interface RegexWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: unknown) => void;
  terminate: () => void;
}

export function testRegex(pattern: string, samples: string[], flags = '', timeoutMs = 300, workerFactory?: () => RegexWorkerLike): Promise<RegexTestResult> {
  if (!workerFactory && typeof Worker === 'undefined') return Promise.resolve(runSynchronously(pattern, flags, samples));
  const syntaxError = compileRegex(pattern, flags);
  if (syntaxError) return Promise.resolve({ ok: false, results: [], error: syntaxError });
  return new Promise((resolve) => {
    const worker: RegexWorkerLike = workerFactory ? workerFactory() : new Worker(new URL('./regexTester.worker.ts', import.meta.url), { type: 'module' });
    const id = `${Date.now()}-${Math.random()}`;
    const timer = globalThis.setTimeout(() => {
      worker.terminate();
      resolve({ ok: false, results: [], error: `测试超过 ${timeoutMs}ms，可能存在灾难性回溯`, timedOut: true });
    }, timeoutMs);
    worker.onmessage = (event) => {
      if (event.data?.id !== id) return;
      globalThis.clearTimeout(timer);
      worker.terminate();
      resolve(event.data.error
        ? { ok: false, results: [], error: event.data.error }
        : { ok: true, results: event.data.results });
    };
    worker.onerror = (event) => {
      globalThis.clearTimeout(timer);
      worker.terminate();
      resolve({ ok: false, results: [], error: event.message || '正则测试 Worker 失败' });
    };
    worker.postMessage({ id, pattern, flags, samples });
  });
}
