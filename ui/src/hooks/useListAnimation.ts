import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

export type ListAnimationState = 'entering' | 'entered' | 'leaving';

export interface ListAnimationRow<T> {
  key: string | number;
  item: T;
  state: ListAnimationState;
  style: CSSProperties;
}

/**
 * 合并当前项与离场占位：key 已重新出现的离场项直接丢弃，
 * 保证返回的 key 唯一（重复 key 会让 React 丢失/重复 DOM 并报警）。
 */
export function mergeRowsWithLeaving<T, K extends string | number>(
  items: Array<{ key: K; item: T }>,
  leaving: Array<{ key: K; item: T }>,
): Array<{ key: K; item: T; leaving: boolean }> {
  const currentKeys = new Set(items.map((entry) => entry.key));
  const seen = new Set<K>();
  const rows: Array<{ key: K; item: T; leaving: boolean }> = [];
  for (const entry of items) {
    rows.push({ ...entry, leaving: false });
    seen.add(entry.key);
  }
  for (const entry of leaving) {
    if (currentKeys.has(entry.key) || seen.has(entry.key)) continue;
    seen.add(entry.key);
    rows.push({ ...entry, leaving: true });
  }
  return rows;
}

const DEFAULT_MS = 350;
const STAGGER_BASE_MS = 60;
const STAGGER_FACTOR = 0.8;
const STAGGER_CAP_MS = 320;

/**
 * 加速阶梯：间隔 base * factor^i 且递减 → 越到后面出现得越快；总等待有界。
 * 空→有内容的首次批使用该阶梯；后续增补固定 0.35s。
 */
export function staggerDelay(index: number) {
  const total = (STAGGER_BASE_MS * (1 - Math.pow(STAGGER_FACTOR, index + 1))) / (1 - STAGGER_FACTOR);
  return Math.min(STAGGER_CAP_MS, Math.round(total));
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * 线性/网格列表的 JS 驱动动效：
 * - 空数组 → 首批内容：逐个出现，间隔越来越短（加速）；
 * - 新增项：0.35s 入场；移除项：0.35s 离场后才真正卸载；
 * - 系统开启「减少动态」时全部跳过。
 */
export function useListAnimation<T, K extends string | number>(
  items: T[],
  keyOf: (item: T) => K,
  options: { enterMs?: number; exitMs?: number } = {},
): ListAnimationRow<T>[] {
  const enterMs = options.enterMs ?? DEFAULT_MS;
  const exitMs = options.exitMs ?? DEFAULT_MS;
  const reduced = usePrefersReducedMotion();
  const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

  const prevKeysRef = useRef<K[] | null>(null);
  const byKeyRef = useRef(new Map<K, T>());
  const pendingRef = useRef(new Map<K, number>());
  const timersRef = useRef<number[]>([]);
  const [leaving, setLeaving] = useState<Array<{ key: K; item: T }>>([]);
  const [, forceRender] = useState(0);

  const keys = useMemo(() => items.map(keyOf), [items, keyOf]);

  useIsoLayoutEffect(() => {
    if (reduced) {
      prevKeysRef.current = keys;
      byKeyRef.current = new Map(items.map((item, index) => [keys[index], item]));
      pendingRef.current.clear();
      return;
    }
    const prevKeys = prevKeysRef.current;
    const isInitialBatch = prevKeys === null || prevKeys.length === 0;
    const prevSet = new Set(prevKeys ?? []);
    const nextSet = new Set(keys);

    // 移除项 → leaving（0.35s 后卸载）
    const removed = (prevKeys ?? []).filter((key) => !nextSet.has(key));
    if (removed.length) {
      const gone = removed
        .map((key) => ({ key, item: byKeyRef.current.get(key) }))
        .filter((entry): entry is { key: K; item: T } => entry.item !== undefined);
      if (gone.length) {
        setLeaving((current) => {
          const existing = new Set(current.map((row) => row.key));
          return [...current, ...gone.filter((entry) => !existing.has(entry.key))];
        });
        for (const entry of gone) {
          const timer = window.setTimeout(() => {
            setLeaving((current) => current.filter((row) => row.key !== entry.key));
          }, exitMs);
          timersRef.current.push(timer);
        }
      }
    }

    // 新增项 → entering（首批发加速阶梯，后续固定 0.35s）
    const added = isInitialBatch ? keys : keys.filter((key) => !prevSet.has(key));
    if (added.length) {
      const nextPending = new Map(pendingRef.current);
      added.forEach((key, index) => nextPending.set(key, isInitialBatch ? staggerDelay(index) : 0));
      pendingRef.current = nextPending;
      forceRender((value) => value + 1);
      for (const key of added) {
        const delay = isInitialBatch ? staggerDelay(added.indexOf(key)) : 0;
        const timer = window.setTimeout(() => {
          pendingRef.current.delete(key);
          forceRender((value) => value + 1);
        }, enterMs + delay);
        timersRef.current.push(timer);
      }
    }

    prevKeysRef.current = keys;
    byKeyRef.current = new Map(items.map((item, index) => [keys[index], item]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('\u0000'), items, enterMs, exitMs, reduced]);

  useEffect(() => () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }, []);

  if (reduced) {
    return items.map((item, index) => ({ key: keys[index], item, state: 'entered' as const, style: {} }));
  }

  return mergeRowsWithLeaving(
    items.map((item, index) => ({ key: keys[index], item })),
    leaving,
  ).map((entry) => {
    if (entry.leaving) {
      return { key: entry.key, item: entry.item, state: 'leaving' as const, style: { animation: `list-leave ${exitMs}ms ease-in both` } };
    }
    const delay = pendingRef.current.get(entry.key);
    if (delay !== undefined) {
      return { key: entry.key, item: entry.item, state: 'entering' as const, style: { animation: `list-enter ${enterMs}ms cubic-bezier(0.16, 1, 0.3, 1) both`, animationDelay: `${delay}ms` } };
    }
    return { key: entry.key, item: entry.item, state: 'entered' as const, style: {} };
  });
}
