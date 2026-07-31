/**
 * Safe JSON utilities with automatic repair.
 * Uses jsonrepair to fix common JSON malformations before parsing.
 */
import { jsonrepair } from 'jsonrepair';

/**
 * Parse JSON with automatic repair. Tries native JSON.parse first;
 * if that fails, attempts jsonrepair then re-parses.
 * Never throws — returns fallback on total failure.
 */
export function parseJson<T>(text: string, fallback: T): T {
  if (!text || typeof text !== 'string') return fallback;
  // Fast path: try native parse first
  try {
    return JSON.parse(text) as T;
  } catch {
    // Slow path: try repair
    try {
      const repaired = jsonrepair(text);
      return JSON.parse(repaired) as T;
    } catch {
      return fallback;
    }
  }
}

/**
 * Parse JSON with automatic repair, returning null on failure.
 */
export function parseJsonOrNull<T>(text: string): T | null {
  return parseJson<T | null>(text, null);
}

/**
 * Parse JSON with automatic repair, throwing a descriptive error on total failure.
 */
export function parseJsonStrict<T>(text: string, context?: string): T {
  if (!text || typeof text !== 'string') {
    throw new Error(`${context || 'JSON'}: 输入为空或非字符串`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    try {
      const repaired = jsonrepair(text);
      return JSON.parse(repaired) as T;
    } catch (err) {
      throw new Error(`${context || 'JSON'} 解析失败: ${err instanceof Error ? err.message : '格式错误'}`);
    }
  }
}

/**
 * Safe JSON.stringify that never throws (handles circular refs).
 */
export function stringifyJson(value: unknown, fallback = '{}'): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/**
 * Deep clone via JSON with repair fallback.
 * If stringify/parse fails (circular refs), returns the original reference.
 */
export function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}
