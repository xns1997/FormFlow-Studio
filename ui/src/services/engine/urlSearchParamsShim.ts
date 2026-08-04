/**
 * URLSearchParams 启动防护
 *
 * 部分宿主环境（旧版 WebView、浏览器扩展 content script、注入式 polyfill）提供
 * 的 URLSearchParams 实现不完整：实例可能缺失 forEach / getAll / entries /
 * Symbol.iterator 等（参见 Mozilla bug 1023984）。React Router 的 useSearchParams
 * 依赖 defaultSearchParams.forEach(...) 合并默认参数，遇到这种实现会直接抛出
 * “defaultSearchParams.forEach is not a function”，导致整个工作区区域崩溃。
 *
 * 本模块在应用渲染前检测全局 URLSearchParams；如果不满足要求，就用一个完全
 * 自包含、不依赖宿主实现的完整实现替换全局构造器。模块导入即生效。
 */

type SearchParamPair = [string, string];

/** application/x-www-form-urlencoded 编码：空格转 '+'，其余按 spec 百分号编码。 */
function urlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()~]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** 解码：'+' 还原为空格；非法百分号序列按字面保留。 */
function urlDecode(value: string): string {
  const plusDecoded = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plusDecoded);
  } catch {
    return plusDecoded.replace(/%[0-9A-Fa-f]{2}/g, (seq) => {
      try {
        return decodeURIComponent(seq);
      } catch {
        return seq;
      }
    });
  }
}

/** 与原生行为一致：按 '&' 分段、按首个 '=' 拆键值，跳过空段。 */
function parseUrlencoded(target: ShimURLSearchParams, input: string): void {
  if (input === '') return;
  for (const segment of input.split('&')) {
    if (segment === '') continue;
    const eq = segment.indexOf('=');
    const key = eq === -1 ? segment : segment.slice(0, eq);
    const value = eq === -1 ? '' : segment.slice(eq + 1);
    target.append(urlDecode(key), urlDecode(value));
  }
}

/** 追加一组可迭代的 [key, value] 对（兼容残缺宿主实例的 entries 鸭子类型）。 */
function appendIterablePairs(target: ShimURLSearchParams, iterable: Iterable<unknown>): void {
  for (const rawPair of iterable) {
    const pair = rawPair as { [Symbol.iterator]?: unknown };
    if (pair == null || typeof pair[Symbol.iterator] !== 'function') continue;
    const parts = Array.from(pair as Iterable<unknown>);
    if (parts.length === 0) continue;
    const key = parts[0] as unknown;
    const value = parts[1] as unknown;
    if (key == null) continue;
    target.append(String(key), String(value ?? ''));
  }
}

/** 从任意 init 中提取 [key, value] 列表。 */
function appendPairs(target: ShimURLSearchParams, init: unknown): void {
  if (init == null) return;
  if (typeof init === 'string') {
    parseUrlencoded(target, init);
    return;
  }

  const source = init as {
    [Symbol.iterator]?: unknown;
    entries?: () => Iterable<unknown>;
    [key: string]: unknown;
  };

  const iterable = typeof source[Symbol.iterator] === 'function' ? (source as Iterable<unknown>) : undefined;
  if (iterable) {
    appendIterablePairs(target, iterable);
    return;
  }
  if (typeof source.entries === 'function') {
    appendIterablePairs(target, source.entries());
    return;
  }

  if (typeof init === 'object') {
    for (const key of Object.keys(source)) {
      const value = source[key];
      if (Array.isArray(value)) {
        for (const item of value) target.append(key, String(item ?? ''));
      } else {
        target.append(key, String(value ?? ''));
      }
    }
  }
}

/**
 * 自包含的 URLSearchParams 实现。不依赖宿主提供的构造器或原型方法，
 * 因此即使全局实现残缺，替换后所有能力仍然可用。
 */
class ShimURLSearchParams implements URLSearchParams {
  private pairs: Array<SearchParamPair> = [];

  constructor(init?: unknown) {
    appendPairs(this, init);
  }

  get size(): number {
    return this.pairs.length;
  }

  append(name: string, value: string): void {
    this.pairs.push([String(name), String(value)]);
  }

  delete(name: string): void {
    this.pairs = this.pairs.filter(([key]) => key !== name);
  }

  get(name: string): string | null {
    for (const [key, value] of this.pairs) {
      if (key === name) return value;
    }
    return null;
  }

  getAll(name: string): string[] {
    return this.pairs.filter(([key]) => key === name).map(([, value]) => value);
  }

  has(name: string): boolean {
    return this.pairs.some(([key]) => key === name);
  }

  set(name: string, value: string): void {
    const next: Array<SearchParamPair> = [];
    let replaced = false;
    for (const [key, current] of this.pairs) {
      if (key === name) {
        if (!replaced) {
          next.push([name, String(value)]);
          replaced = true;
        }
        continue;
      }
      next.push([key, current]);
    }
    if (!replaced) next.push([name, String(value)]);
    this.pairs = next;
  }

  sort(): void {
    this.pairs.sort(([keyA, valueA], [keyB, valueB]) => {
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      if (valueA < valueB) return -1;
      if (valueA > valueB) return 1;
      return 0;
    });
  }

  forEach(callbackfn: (value: string, key: string, parent: URLSearchParams) => void, thisArg?: unknown): void {
    for (const [key, value] of this.pairs) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  entries(): IterableIterator<SearchParamPair> {
    return this.pairs[Symbol.iterator]();
  }

  keys(): IterableIterator<string> {
    return this.pairs.map(([key]) => key)[Symbol.iterator]();
  }

  values(): IterableIterator<string> {
    return this.pairs.map(([, value]) => value)[Symbol.iterator]();
  }

  [Symbol.iterator](): IterableIterator<SearchParamPair> {
    return this.pairs[Symbol.iterator]();
  }

  toString(): string {
    return this.pairs.map(([key, value]) => `${urlEncode(key)}=${urlEncode(value)}`).join('&');
  }
}

function isUsableURLSearchParams(): boolean {
  const Ctor = (globalThis as { URLSearchParams?: unknown }).URLSearchParams;
  if (typeof Ctor !== 'function') return false;
  try {
    const probe = new (Ctor as new (init?: string) => URLSearchParams)('a=1&b=2');
    const p = probe as URLSearchParams & {
      [Symbol.iterator]?: unknown;
      size?: unknown;
    };
    if (typeof p.forEach !== 'function') return false;
    if (typeof p.getAll !== 'function') return false;
    if (typeof p.get !== 'function') return false;
    if (typeof p.has !== 'function') return false;
    if (typeof p.set !== 'function') return false;
    if (typeof p.append !== 'function') return false;
    if (typeof p.delete !== 'function') return false;
    if (typeof p.entries !== 'function') return false;
    if (typeof p.keys !== 'function') return false;
    if (typeof p.values !== 'function') return false;
    if (typeof p.toString !== 'function') return false;
    if (typeof p.sort !== 'function') return false;
    if (typeof p[Symbol.iterator] !== 'function') return false;
    if (typeof p.size !== 'number') return false;
    if (p.size !== 2) return false;
    if (p.get('a') !== '1') return false;
    let iterated = false;
    for (const _ of probe) {
      iterated = true;
      break;
    }
    if (!iterated) return false;
    p.forEach(() => { /* 验证 forEach 可实际调用 */ });
    return true;
  } catch {
    return false;
  }
}

/**
 * 确保全局 URLSearchParams 可用。返回 true 表示检测到残缺实现并已替换。
 * 模块导入时会自动调用一次；也可在测试或特殊入口中显式调用。
 */
export function ensureUsableURLSearchParams(): boolean {
  if (isUsableURLSearchParams()) return false;
  try {
    (globalThis as { URLSearchParams: unknown }).URLSearchParams = ShimURLSearchParams;
    return true;
  } catch {
    // 某些宿主禁止覆写全局，尽力而为；错误仍会走诊断分类路径。
    return false;
  }
}

/** 当前全局 URLSearchParams 是否为内置兼容实现（用于诊断展示）。 */
export function isURLSearchParamsShimActive(): boolean {
  return (globalThis as { URLSearchParams?: unknown }).URLSearchParams === ShimURLSearchParams;
}

// 模块导入即执行，保证先于 React Router 创建任何 URLSearchParams 实例。
ensureUsableURLSearchParams();
