import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = async (args, props) => {
  const [trigger, urlOverride, body] = args;
  const url = (urlOverride as string) || (props.url as string) || '';
  const method = (props.method as string) || 'GET';
  const headers = JSON.parse((props.headers as string) || '{}');
  try {
    const resp = await fetch(url, { method, headers, body: method !== 'GET' ? JSON.stringify(body) : undefined });
    const data = await resp.json().catch(() => ({}));
    return { success: { event: 'apiSuccess', timestamp: Date.now() }, response: data, status: resp.status };
  } catch (e) {
    return { error: { event: 'apiError', error: String(e), timestamp: Date.now() }, response: {}, status: 0 };
  }
};
