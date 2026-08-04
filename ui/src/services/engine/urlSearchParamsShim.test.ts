import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { ensureUsableURLSearchParams, isURLSearchParamsShimActive } from './urlSearchParamsShim';

const originalURLSearchParams = globalThis.URLSearchParams;

after(() => {
  globalThis.URLSearchParams = originalURLSearchParams;
});

/** 模拟 Mozilla bug 1023984 的残缺实现：有基础方法但实例不可迭代、缺失 forEach。 */
class BrokenURLSearchParams {
  size = 0;
  constructor(_init?: unknown) {}
  append() {}
  set() {}
  get() { return null; }
  getAll() { return []; }
  has() { return false; }
  delete() {}
  sort() {}
  toString() { return ''; }
}

test('ensureUsableURLSearchParams replaces a broken global implementation', () => {
  globalThis.URLSearchParams = BrokenURLSearchParams as unknown as typeof URLSearchParams;
  assert.equal(isURLSearchParamsShimActive(), false);

  assert.equal(ensureUsableURLSearchParams(), true);
  assert.equal(isURLSearchParamsShimActive(), true);

  const params = new URLSearchParams('a=1&b=2');
  assert.equal(typeof params.forEach, 'function');
  assert.equal(typeof params.entries, 'function');
  assert.equal(typeof params[Symbol.iterator], 'function');
  assert.equal(params.get('a'), '1');
  assert.deepEqual(params.getAll('b'), ['2']);
  assert.equal(params.size, 2);
  assert.equal(params.has('a'), true);
  assert.equal(String(params), 'a=1&b=2');
});

test('shim round-trips common URLSearchParams usage', () => {
  const params = new URLSearchParams();
  params.append('q', 'hello world');
  params.set('lang', 'zh-CN');
  assert.equal(params.get('q'), 'hello world');
  assert.equal(String(params), 'q=hello+world&lang=zh-CN');

  const fromObject = new URLSearchParams({ tab: 'overview', lang: 'zh' });
  assert.equal(fromObject.get('tab'), 'overview');
  assert.equal(fromObject.size, 2);

  const fromPairs = new URLSearchParams([['k', '1'], ['k', '2']]);
  assert.deepEqual(fromPairs.getAll('k'), ['1', '2']);
  assert.equal(fromPairs.toString(), 'k=1&k=2');

  const copied = new URLSearchParams(fromObject);
  assert.equal(copied.get('lang'), 'zh');

  const decoded = new URLSearchParams('a=hello%20world&b=%E4%B8%AD%E6%96%87&c=1+1');
  assert.equal(decoded.get('a'), 'hello world');
  assert.equal(decoded.get('b'), '中文');
  assert.equal(decoded.get('c'), '1 1');
});

test('shim supports the React Router getSearchParamsForLocation flow', () => {
  // 复刻 react-router 的 getSearchParamsForLocation：默认参数通过 forEach 合并进当前 search。
  const defaultSearchParams = new URLSearchParams({ tab: 'overview', lang: 'zh' });
  const searchParams = new URLSearchParams('mode=flow');
  defaultSearchParams.forEach((_, key) => {
    if (!searchParams.has(key)) {
      defaultSearchParams.getAll(key).forEach((value) => {
        searchParams.append(key, value);
      });
    }
  });
  assert.equal(searchParams.get('tab'), 'overview');
  assert.equal(searchParams.get('lang'), 'zh');
  assert.equal(searchParams.get('mode'), 'flow');
});

test('ensureUsableURLSearchParams keeps a working implementation untouched', () => {
  globalThis.URLSearchParams = originalURLSearchParams;
  assert.equal(ensureUsableURLSearchParams(), false);
  assert.equal(isURLSearchParamsShimActive(), false);

  const native = new URLSearchParams('a=1');
  assert.equal(native.get('a'), '1');
});
