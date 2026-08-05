import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, items] = args;
  const loopType = (props.loopType as string) || 'forEach';
  const arr = (items as unknown[]) || [];
  const count = loopType === 'repeat' ? (props.repeatCount as number) || 1 : arr.length;
  const results: unknown[] = [];
  for (let i = 0; i < count; i++) {
    results.push({ each: { event: 'loopEach', index: i, timestamp: Date.now() }, item: arr[i] ?? i, index: i });
  }
  return { done: { event: 'loopDone', count, timestamp: Date.now() }, _iterations: results };
};
