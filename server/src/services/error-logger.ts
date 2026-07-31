/**
 * Backend Error Logger — receives, stores, and serves errors from frontend and backend.
 * Unified error management for the entire application.
 */

export type ErrorSeverity = 'info' | 'warn' | 'error' | 'debug';
export type ErrorCategory =
  | 'data-binding' | 'expression' | 'workflow' | 'validation'
  | 'runtime' | 'network' | 'permission' | 'render' | 'unknown';

export interface ManagedError {
  id: string;
  timestamp: number;
  severity: ErrorSeverity;
  source: string;
  category: ErrorCategory;
  title: string;
  message: string;
  componentId?: string;
  field?: string;
  nodeId?: string;
  workflowId?: string;
  context?: Record<string, unknown>;
  stack?: string;
}

export interface ErrorSummary {
  total: number;
  bySeverity: Record<ErrorSeverity, number>;
  byCategory: Record<ErrorCategory, number>;
  bySource: Record<string, number>;
  recent: ManagedError[];
}

const MAX_ERRORS = 2000;
const errorBuffer: ManagedError[] = [];
const sourceIndex = new Map<string, ManagedError[]>();
const severityIndex = new Map<ErrorSeverity, ManagedError[]>();
const categoryIndex = new Map<ErrorCategory, ManagedError[]>();

function indexEntry(entry: ManagedError) {
  // Source index
  const sourceList = sourceIndex.get(entry.source) || [];
  sourceList.push(entry);
  sourceIndex.set(entry.source, sourceList);

  // Severity index
  const sevList = severityIndex.get(entry.severity) || [];
  sevList.push(entry);
  severityIndex.set(entry.severity, sevList);

  // Category index
  const catList = categoryIndex.get(entry.category) || [];
  catList.push(entry);
  categoryIndex.set(entry.category, catList);
}

function emitToConsole(entry: ManagedError) {
  const prefix = `[ERROR:${entry.source}:${entry.category}]`;
  const payload = `${prefix} ${entry.title}: ${entry.message}`;
  if (entry.severity === 'error') console.error(payload, entry.stack || '');
  else if (entry.severity === 'warn') console.warn(payload);
  else if (entry.severity === 'debug') console.debug(payload);
  else console.log(payload);
}

/**
 * Log a backend error directly.
 */
export function logError(params: {
  severity?: ErrorSeverity;
  source?: string;
  category?: ErrorCategory;
  title: string;
  message: string;
  componentId?: string;
  field?: string;
  nodeId?: string;
  workflowId?: string;
  context?: Record<string, unknown>;
  stack?: string;
}): ManagedError {
  const entry: ManagedError = {
    id: `srv_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    severity: params.severity || 'error',
    source: params.source || 'server',
    category: params.category || 'unknown',
    title: params.title,
    message: params.message,
    componentId: params.componentId,
    field: params.field,
    nodeId: params.nodeId,
    workflowId: params.workflowId,
    context: params.context,
    stack: params.stack,
  };

  errorBuffer.push(entry);
  if (errorBuffer.length > MAX_ERRORS) {
    const removed = errorBuffer.splice(0, errorBuffer.length - MAX_ERRORS);
    // Clean indexes (best effort)
    for (const r of removed) {
      const sl = sourceIndex.get(r.source);
      if (sl) { const i = sl.indexOf(r); if (i >= 0) sl.splice(i, 1); }
      const svl = severityIndex.get(r.severity);
      if (svl) { const i = svl.indexOf(r); if (i >= 0) svl.splice(i, 1); }
      const cl = categoryIndex.get(r.category);
      if (cl) { const i = cl.indexOf(r); if (i >= 0) cl.splice(i, 1); }
    }
  }

  indexEntry(entry);
  emitToConsole(entry);
  return entry;
}

/**
 * Receive errors from the frontend (batch).
 */
export function ingestErrors(errors: Array<Omit<ManagedError, 'id'>>): ManagedError[] {
  return errors.map((e) => logError(e));
}

/**
 * Get errors with filters.
 */
export function getErrors(filters: {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  source?: string;
  limit?: number;
} = {}): ManagedError[] {
  let result: ManagedError[];

  // Use indexes for efficient filtering
  if (filters.severity && filters.category) {
    const sevSet = new Set(severityIndex.get(filters.severity) || []);
    result = (categoryIndex.get(filters.category) || []).filter((e) => sevSet.has(e));
  } else if (filters.severity) {
    result = [...(severityIndex.get(filters.severity) || [])];
  } else if (filters.category) {
    result = [...(categoryIndex.get(filters.category) || [])];
  } else if (filters.source) {
    result = [...(sourceIndex.get(filters.source) || [])];
  } else {
    result = [...errorBuffer];
  }

  if (filters.source && (filters.severity || filters.category)) {
    result = result.filter((e) => e.source === filters.source);
  }

  const limit = Math.max(1, Math.min(MAX_ERRORS, filters.limit || 100));
  return result.slice(-limit).reverse();
}

/**
 * Get error summary statistics.
 */
export function getErrorSummary(): ErrorSummary {
  const bySeverity: Record<ErrorSeverity, number> = { info: 0, warn: 0, error: 0, debug: 0 };
  const byCategory: Record<ErrorCategory, number> = {
    'data-binding': 0, expression: 0, workflow: 0, validation: 0,
    runtime: 0, network: 0, permission: 0, render: 0, unknown: 0,
  };
  const bySource: Record<string, number> = {};

  for (const e of errorBuffer) {
    bySeverity[e.severity]++;
    byCategory[e.category]++;
    bySource[e.source] = (bySource[e.source] || 0) + 1;
  }

  return {
    total: errorBuffer.length,
    bySeverity,
    byCategory,
    bySource,
    recent: errorBuffer.slice(-10).reverse(),
  };
}

/**
 * Clear all errors.
 */
export function clearErrors(): void {
  errorBuffer.splice(0, errorBuffer.length);
  sourceIndex.clear();
  severityIndex.clear();
  categoryIndex.clear();
}
