export type ServerDebugLevel = 'info' | 'warn' | 'error' | 'debug';

export interface ServerDebugEntry {
  id: string;
  timestamp: number;
  level: ServerDebugLevel;
  source: string;
  route?: string;
  requestId?: string;
  message: string;
  context?: Record<string, unknown>;
}

const MAX_LOGS = 1000;
const buffer: ServerDebugEntry[] = [];

function emitToConsole(entry: ServerDebugEntry) {
  const payload = [`[${entry.level.toUpperCase()}]`, entry.source, entry.requestId ? `#${entry.requestId}` : '', entry.message].filter(Boolean).join(' ');
  if (entry.level === 'warn') console.warn(payload, entry.context || '');
  else if (entry.level === 'error') console.error(payload, entry.context || '');
  else if (entry.level === 'debug') console.debug(payload, entry.context || '');
  else console.log(payload, entry.context || '');
}

export function logDebug(
  level: ServerDebugLevel,
  source: string,
  message: string,
  options: {
    route?: string;
    requestId?: string;
    context?: Record<string, unknown>;
  } = {},
): ServerDebugEntry {
  const entry: ServerDebugEntry = {
    id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    level,
    source,
    route: options.route,
    requestId: options.requestId,
    message,
    context: options.context,
  };
  buffer.push(entry);
  if (buffer.length > MAX_LOGS) buffer.splice(0, buffer.length - MAX_LOGS);
  emitToConsole(entry);
  return entry;
}

export function getDebugLogs(filters: {
  level?: ServerDebugLevel;
  source?: string;
  limit?: number;
  requestId?: string;
} = {}) {
  let result = [...buffer];
  if (filters.level) result = result.filter((item) => item.level === filters.level);
  if (filters.source) result = result.filter((item) => item.source === filters.source);
  if (filters.requestId) result = result.filter((item) => item.requestId === filters.requestId);
  const limit = Math.max(1, Math.min(1000, Number(filters.limit) || 100));
  return result.slice(-limit).reverse();
}

export function clearDebugLogs() {
  buffer.splice(0, buffer.length);
}
