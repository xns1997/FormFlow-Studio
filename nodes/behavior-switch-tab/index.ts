import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger] = args;
  const tab = (props.tabName as string) || '测试运行';
  return { trigger: { event: 'switchTab', tabName: tab, timestamp: Date.now() }, tabName: tab };
};
