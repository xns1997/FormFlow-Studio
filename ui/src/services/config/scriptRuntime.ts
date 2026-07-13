import type { DebugEntry, DebugEntryFormat, DebugEntrySource } from '../../project/types';

export type ScriptPrintLevel = 'info' | 'warn' | 'error' | 'debug';

export interface ScriptLogEntry extends Omit<DebugEntry, 'id' | 'timestamp' | 'source'> {
  level: ScriptPrintLevel;
  source?: DebugEntrySource;
}

export interface ScriptExecutionScope {
  ctx: Record<string, unknown>;
  callbacks: Record<string, unknown>;
  Print: (...args: unknown[]) => void;
  PrintInfo: (...args: unknown[]) => void;
  PrintWarn: (...args: unknown[]) => void;
  PrintError: (...args: unknown[]) => void;
  PrintDebug: (...args: unknown[]) => void;
  PrintJson: (label: string, data?: unknown) => void;
  PrintTable: (label: string, rows?: unknown) => void;
  PrintGroup: (label: string, data?: unknown) => void;
  [key: string]: unknown;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

const SCRIPT_ALIAS_KEYS = [
  'getValue',
  'getValues',
  'setValue',
  'setValues',
  'clearValue',
  'clearValues',
  'setField',
  'setVisible',
  'toggleVisible',
  'setDisabled',
  'toggleDisabled',
  'setRequired',
  'toggleRequired',
  'setFieldState',
  'focusField',
  'focusControl',
  'scrollToField',
  'scrollToControl',
  'switchTab',
  'openTab',
  'showMessage',
  'debug',
  'validateField',
  'querySheet',
  'findRows',
  'findRow',
  'nextSequence',
  'fillForm',
  'requireFields',
  'resetForm',
  'runWorkflow',
  'runConfiguredWorkflow',
  'call',
  'updateRow',
  'submit',
  'getState',
  'controls',
  'formData',
  'originalData',
  'originalValues',
  'value',
  'values',
  'field',
  'detail',
  'component',
  'componentId',
  'componentType',
  'dirty',
  'changedFields',
  'previousValue',
  'timestamp',
  'event',
  'eventName',
  'callbacks',
];

function stringifyDebugValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    return [value.name, value.message, value.stack].filter(Boolean).join(': ');
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatScriptDebugArgs(args: unknown[]): string {
  return args.map((arg) => stringifyDebugValue(arg)).join(' ');
}

function normalizeContext(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function buildLogEntry(level: ScriptPrintLevel, args: unknown[], format: DebugEntryFormat = 'text'): ScriptLogEntry {
  const [first, second] = args;
  const title = typeof first === 'string' ? first : undefined;
  const context = normalizeContext(second)
    || normalizeContext(first && typeof first !== 'string' ? first : undefined)
    || (Array.isArray(second) ? { rows: second } : undefined);
  return {
    level,
    source: 'script',
    format,
    title,
    message: formatScriptDebugArgs(args),
    context,
  };
}

export function getNativeConsole(): Pick<Console, 'log' | 'warn' | 'error' | 'debug'> {
  if (typeof globalThis !== 'undefined' && globalThis.console) {
    return {
      log: globalThis.console.log.bind(globalThis.console),
      warn: globalThis.console.warn.bind(globalThis.console),
      error: globalThis.console.error.bind(globalThis.console),
      debug: (globalThis.console.debug || globalThis.console.log).bind(globalThis.console),
    };
  }
  const noop = () => {};
  return { log: noop, warn: noop, error: noop, debug: noop };
}

function createPrintFunctions(writeLog: (entry: ScriptLogEntry) => void) {
  const nativeConsole = getNativeConsole();
  const emit = (level: ScriptPrintLevel, args: unknown[], format: DebugEntryFormat = 'text') => {
    writeLog(buildLogEntry(level, args, format));
    switch (level) {
      case 'warn':
        nativeConsole.warn('[Script Print]', ...args);
        break;
      case 'error':
        nativeConsole.error('[Script Print]', ...args);
        break;
      case 'debug':
        nativeConsole.debug('[Script Print]', ...args);
        break;
      default:
        nativeConsole.log('[Script Print]', ...args);
        break;
    }
  };
  return {
    Print: (...args: unknown[]) => emit('info', args),
    PrintInfo: (...args: unknown[]) => emit('info', args),
    PrintWarn: (...args: unknown[]) => emit('warn', args),
    PrintError: (...args: unknown[]) => emit('error', args),
    PrintDebug: (...args: unknown[]) => emit('debug', args),
    PrintJson: (label: string, data?: unknown) => emit('info', [label, data], 'json'),
    PrintTable: (label: string, rows?: unknown) => emit('info', [label, rows], 'table'),
    PrintGroup: (label: string, data?: unknown) => emit('debug', [label, data], 'group'),
  };
}

export function isFunctionExpression(code: string): boolean {
  const source = code.trim();
  return /^(async\s+)?function\b/.test(source)
    || /^(async\s*)?\([^)]*\)\s*=>/.test(source)
    || /^(async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(source);
}

export function createScriptExecutionScope(
  ctx: Record<string, unknown>,
  options: {
    callbacks?: Record<string, unknown>;
    writeLog: (entry: ScriptLogEntry) => void;
  },
): ScriptExecutionScope {
  const printFns = createPrintFunctions(options.writeLog);
  const originalValues = (ctx.originalValues as Record<string, unknown> | undefined)
    ?? (ctx.originalData as Record<string, unknown> | undefined)
    ?? {};
  const values = (ctx.values as Record<string, unknown> | undefined)
    ?? (ctx.formData as Record<string, unknown> | undefined)
    ?? {};
  const callbacks = options.callbacks ?? (ctx.callbacks as Record<string, unknown> | undefined) ?? {};

  const scope: ScriptExecutionScope = {
    ctx,
    callbacks,
    ...printFns,
  };

  if (ctx && typeof ctx === 'object') {
    const originalConsole = ((ctx.console && typeof ctx.console === 'object') ? ctx.console : getNativeConsole()) as Pick<Console, 'log' | 'warn' | 'error' | 'debug'>;
    const wrapConsole = (level: ScriptPrintLevel) => (...args: unknown[]) => {
      writeConsole(level, originalConsole, args, options.writeLog);
    };
    (ctx as Record<string, unknown>).console = {
      ...originalConsole,
      log: wrapConsole('info'),
      warn: wrapConsole('warn'),
      error: wrapConsole('error'),
      debug: wrapConsole('debug'),
    };
  }

  for (const key of SCRIPT_ALIAS_KEYS) {
    if (key === 'callbacks') {
      scope.callbacks = callbacks;
      continue;
    }
    if (key === 'originalValues') {
      scope.originalValues = originalValues;
      continue;
    }
    if (key === 'values') {
      scope.values = values;
      continue;
    }
    if (key === 'formData') {
      scope.formData = (ctx.formData as Record<string, unknown> | undefined) ?? values;
      continue;
    }
    if (key in ctx) {
      const value = ctx[key];
      scope[key] = typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(ctx) : value;
    }
  }

  return scope;
}

function writeConsole(
  level: ScriptPrintLevel,
  nativeConsole: Pick<Console, 'log' | 'warn' | 'error' | 'debug'>,
  args: unknown[],
  writeLog: (entry: ScriptLogEntry) => void,
) {
  writeLog({
    ...buildLogEntry(level, args, 'text'),
    title: '[console]',
  });
  if (level === 'warn') nativeConsole.warn('[Script Console]', ...args);
  else if (level === 'error') nativeConsole.error('[Script Console]', ...args);
  else if (level === 'debug') nativeConsole.debug('[Script Console]', ...args);
  else nativeConsole.log('[Script Console]', ...args);
}

export async function executeInjectedScript(
  code: string,
  scope: ScriptExecutionScope,
): Promise<unknown> {
  const names = Object.keys(scope).filter((key) => /^[$A-Z_][0-9A-Z_$]*$/i.test(key));
  const destructure = names.length > 0 ? `const { ${names.join(', ')} } = __scope;` : '';

  if (isFunctionExpression(code)) {
    const evaluate = new AsyncFunction('__scope', `
      ${destructure}
      const callback = (${code});
      if (typeof callback !== 'function') throw new Error('事件代码必须返回一个回调函数');
      return await callback(ctx);
    `);
    return evaluate(scope);
  }

  const evaluate = new AsyncFunction('__scope', `
    ${destructure}
    return await (async () => { ${code}\n })();
  `);
  return evaluate(scope);
}
