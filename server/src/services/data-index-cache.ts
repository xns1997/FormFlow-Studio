/**
 * Data Index & Cache Service
 *
 * Provides in-memory indexing and LRU caching for large datasets
 * to accelerate filtering, sorting, and pagination operations.
 */
import { createHash } from 'node:crypto';

// ── Types ──────────────────────────────────────────────

interface IndexEntry {
  values: Map<unknown, Set<number>>; // value → row indices
  nullIndices: Set<number>;
}

interface CachedQueryResult {
  rows: Record<string, unknown>[];
  total: number;
  queryTotal: number;
  dataVersion: string;
}

interface CacheEntry {
  key: string;
  result: CachedQueryResult;
  timestamp: number;
  hits: number;
}

// ── LRU Cache ──────────────────────────────────────────

class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 100, ttlMs = 60_000) {
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    entry.hits++;
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(key: string, result: CachedQueryResult): void {
    // Evict oldest if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
      else break;
    }
    this.cache.set(key, {
      key,
      result,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ── Column Index ───────────────────────────────────────

class ColumnIndex {
  private indexes = new Map<string, IndexEntry>();

  build(rows: Record<string, unknown>[], columns: string[]): void {
    this.indexes.clear();

    for (const col of columns) {
      const values = new Map<unknown, Set<number>>();
      const nullIndices = new Set<number>();

      for (let i = 0; i < rows.length; i++) {
        const val = rows[i][col];
        if (val == null || val === '') {
          nullIndices.add(i);
        } else {
          let set = values.get(val);
          if (!set) {
            set = new Set();
            values.set(val, set);
          }
          set.add(i);
        }
      }

      this.indexes.set(col, { values, nullIndices });
    }
  }

  /** Returns row indices matching a filter on a column */
  filter(column: string, filterType: string, filterValue: unknown, filterValue2?: unknown): Set<number> | null {
    const index = this.indexes.get(column);
    if (!index) return null; // No index, fall back to full scan

    const allIndices = new Set<number>();
    for (const indices of index.values.values()) {
      for (const i of indices) allIndices.add(i);
    }
    for (const i of index.nullIndices) allIndices.add(i);

    switch (filterType) {
      case 'blank':
        return index.nullIndices;

      case 'notBlank': {
        const result = new Set<number>();
        for (const indices of index.values.values()) {
          for (const i of indices) result.add(i);
        }
        return result;
      }

      case 'equals': {
        const matching = index.values.get(filterValue);
        return matching || new Set();
      }

      case 'notEqual': {
        const matching = index.values.get(filterValue);
        const result = new Set(allIndices);
        if (matching) for (const i of matching) result.delete(i);
        return result;
      }

      case 'contains': {
        const result = new Set<number>();
        const search = String(filterValue).toLowerCase();
        for (const [val, indices] of index.values.entries()) {
          if (String(val).toLowerCase().includes(search)) {
            for (const i of indices) result.add(i);
          }
        }
        return result;
      }

      case 'notContains': {
        const result = new Set<number>();
        const search = String(filterValue).toLowerCase();
        for (const [val, indices] of index.values.entries()) {
          if (!String(val).toLowerCase().includes(search)) {
            for (const i of indices) result.add(i);
          }
        }
        for (const i of index.nullIndices) result.add(i);
        return result;
      }

      case 'startsWith': {
        const result = new Set<number>();
        const search = String(filterValue).toLowerCase();
        for (const [val, indices] of index.values.entries()) {
          if (String(val).toLowerCase().startsWith(search)) {
            for (const i of indices) result.add(i);
          }
        }
        return result;
      }

      case 'endsWith': {
        const result = new Set<number>();
        const search = String(filterValue).toLowerCase();
        for (const [val, indices] of index.values.entries()) {
          if (String(val).toLowerCase().endsWith(search)) {
            for (const i of indices) result.add(i);
          }
        }
        return result;
      }

      case 'greaterThan': {
        const result = new Set<number>();
        const threshold = Number(filterValue);
        for (const [val, indices] of index.values.entries()) {
          if (Number(val) > threshold) {
            for (const i of indices) result.add(i);
          }
        }
        return result;
      }

      case 'greaterThanOrEqual': {
        const result = new Set<number>();
        const threshold = Number(filterValue);
        for (const [val, indices] of index.values.entries()) {
          if (Number(val) >= threshold) {
            for (const i of indices) result.add(i);
          }
        }
        return result;
      }

      case 'lessThan': {
        const result = new Set<number>();
        const threshold = Number(filterValue);
        for (const [val, indices] of index.values.entries()) {
          if (Number(val) < threshold) {
            for (const i of indices) result.add(i);
          }
        }
        return result;
      }

      case 'lessThanOrEqual': {
        const result = new Set<number>();
        const threshold = Number(filterValue);
        for (const [val, indices] of index.values.entries()) {
          if (Number(val) <= threshold) {
            for (const i of indices) result.add(i);
          }
        }
        return result;
      }

      case 'inRange': {
        const result = new Set<number>();
        const min = Number(filterValue);
        const max = Number(filterValue2);
        for (const [val, indices] of index.values.entries()) {
          const n = Number(val);
          if (n >= min && n <= max) {
            for (const i of indices) result.add(i);
          }
        }
        return result;
      }

      default:
        return null; // Unknown filter type, fall back to full scan
    }
  }
}

// ── DataIndexManager ───────────────────────────────────

/** 数据索引管理器（Sheet 读取缓存与失效）。 */
export class DataIndexManager {
  private indexes = new Map<string, ColumnIndex>();
  private cache = new LRUCache(50, 30_000); // 50 entries, 30s TTL

  /** Get or build index for a dataset */
  getIndex(key: string, rows: Record<string, unknown>[], columns: string[]): ColumnIndex {
    let index = this.indexes.get(key);
    if (!index) {
      index = new ColumnIndex();
      index.build(rows, columns);
      this.indexes.set(key, index);
    }
    return index;
  }

  /** Invalidate index for a dataset (call when data changes) */
  invalidate(key: string): void {
    this.indexes.delete(key);
    // Also invalidate related cache entries
    this.cache.invalidateAll();
  }

  /** Get cached query result */
  getCachedResult(cacheKey: string): CachedQueryResult | null {
    const entry = this.cache.get(cacheKey);
    return entry ? entry.result : null;
  }

  /** Cache a query result */
  cacheResult(cacheKey: string, result: CachedQueryResult): void {
    this.cache.set(cacheKey, result);
  }

  /** Generate cache key from query parameters */
  static makeCacheKey(
    fileId: string,
    sheetName: string,
    page: number,
    pageSize: number,
    search: string,
    keySearch: string,
    sortModel: unknown[],
    filterModel: Record<string, unknown>,
  ): string {
    const hash = createHash('md5')
      .update(JSON.stringify({ fileId, sheetName, page, pageSize, search, keySearch, sortModel, filterModel }))
      .digest('hex');
    return hash;
  }
}

// Singleton instance
/** 全局数据索引管理器实例。 */
export const dataIndexManager = new DataIndexManager();
