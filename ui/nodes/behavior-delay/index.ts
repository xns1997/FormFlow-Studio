import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger] = args;
  const ms = (props.delayMs as number) || 1000;
  return new Promise((resolve) => {
    setTimeout(() => resolve({ trigger: { event: 'delayComplete', delayMs: ms, timestamp: Date.now() } }), ms);
  });
};
