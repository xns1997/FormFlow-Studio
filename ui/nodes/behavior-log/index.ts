import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, msgOverride, data] = args;
  const msg = (msgOverride as string) || (props.message as string) || '';
  const level = (props.logLevel as string) || 'info';
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${level.toUpperCase()}] ${msg}`, data ?? '');
  return { trigger: { event: 'logWritten', level, message: msg, timestamp: Date.now() } };
};
