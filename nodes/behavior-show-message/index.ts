import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, msgOverride] = args;
  const msg = (msgOverride as string) || (props.message as string) || '';
  const type = (props.messageType as string) || 'info';
  console.log(`[${type.toUpperCase()}] ${msg}`);
  return { trigger: { event: 'showMessage', message: msg, type, timestamp: Date.now() }, message: msg };
};
