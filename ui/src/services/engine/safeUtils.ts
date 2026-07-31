/**
 * Safe utilities — wrappers that never throw, ensuring the UI stays responsive.
 * Every function catches errors internally and returns a safe fallback.
 */

import { reportError } from './errorManager';

/**
 * Wraps an async function so it never rejects.
 * Returns the result on success, or the fallback on failure.
 */
export function safeAsync<T>(fn: () => Promise<T>, fallback: T, context?: string): Promise<T> {
  return fn().catch((err) => {
    reportError({
      severity: 'error',
      source: 'ui',
      title: context ? `${context} 失败` : '异步操作失败',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fallback;
  });
}

/**
 * Wraps a sync function so it never throws.
 * Returns the result on success, or the fallback on failure.
 */
export function safeSync<T>(fn: () => T, fallback: T, context?: string): T {
  try {
    return fn();
  } catch (err) {
    reportError({
      severity: 'error',
      source: 'ui',
      title: context ? `${context} 失败` : '操作失败',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fallback;
  }
}

/**
 * Safe JSON.parse — never throws.
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safe JSON.stringify — never throws.
 */
export function safeJsonStringify(value: unknown, fallback = '{}'): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/**
 * Safe localStorage.getItem — never throws.
 */
export function safeLocalStorageGet(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Safe localStorage.setItem — never throws.
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe localStorage.removeItem — never throws.
 */
export function safeLocalStorageRemove(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe fetch — never rejects. Returns null on any failure.
 */
export async function safeFetch<T = unknown>(
  url: string,
  options?: RequestInit,
  fallback: T | null = null,
): Promise<{ data: T | null; error: string | null; ok: boolean }> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { data: null, error: `HTTP ${response.status}: ${text || response.statusText}`, ok: false };
    }
    const data = await response.json().catch(() => null) as T | null;
    return { data, error: null, ok: true };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : String(err),
      ok: false,
    };
  }
}

/**
 * Safe event handler wrapper — catches errors in event handlers
 * and reports them without crashing the component.
 */
export function safeEventHandler<E = unknown>(
  handler: (event: E) => void,
  context?: string,
): (event: E) => void {
  return (event: E) => {
    try {
      handler(event);
    } catch (err) {
      reportError({
        severity: 'error',
        source: 'ui',
        title: context ? `${context} 事件处理失败` : '事件处理失败',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  };
}

/**
 * Safe async event handler wrapper — catches errors in async event handlers.
 */
export function safeAsyncEventHandler<E = unknown>(
  handler: (event: E) => Promise<void>,
  context?: string,
): (event: E) => void {
  return (event: E) => {
    handler(event).catch((err) => {
      reportError({
        severity: 'error',
        source: 'ui',
        title: context ? `${context} 事件处理失败` : '异步事件处理失败',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    });
  };
}

/**
 * Safe component render wrapper — catches errors during render
 * and returns a fallback UI.
 */
export function safeRender<T>(fn: () => T, fallback: T, componentName?: string): T {
  try {
    return fn();
  } catch (err) {
    reportError({
      severity: 'error',
      source: 'ui',
      title: `${componentName || '组件'} 渲染失败`,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fallback;
  }
}
