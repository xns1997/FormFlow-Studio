import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, msgOverride, data] = args;
  const msg = (msgOverride as string) || (props.message as string) || '';
  const level = (props.logLevel as string) || 'info';
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${level.toUpperCase()}] ${msg}`, data ?? '');
  return { trigger: { event: 'logWritten', level, message: msg, timestamp: Date.now() } };
};
