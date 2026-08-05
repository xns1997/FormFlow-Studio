import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger] = args;
  const tab = (props.tabName as string) || '测试运行';
  return { trigger: { event: 'switchTab', tabName: tab, timestamp: Date.now() }, tabName: tab };
};
