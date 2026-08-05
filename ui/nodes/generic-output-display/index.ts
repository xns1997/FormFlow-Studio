import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, properties) => {
  const [value, labelOverride] = args;
  const label = (labelOverride as string) || (properties.label as string) || '输出';
  const format = (properties.format as string) || 'auto';
  const logToConsole = properties.logToConsole as boolean ?? false;

  let display: string;
  if (format === 'json') display = JSON.stringify(value, null, 2);
  else if (format === 'text') display = String(value);
  else display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

  if (logToConsole) console.log(`[${label}]`, value);

  return { value, _display: `[${label}] ${display}` };
};
