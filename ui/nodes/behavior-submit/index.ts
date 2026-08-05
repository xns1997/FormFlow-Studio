import type { NodeExecutor } from '../types';
/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [trigger, formData, originalData] = args;
  const form = (formData as Record<string, unknown>) || {};
  const orig = (originalData as Record<string, unknown>) || {};
  const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
  for (const key of Object.keys(form)) {
    if (JSON.stringify(form[key]) !== JSON.stringify(orig[key])) {
      changes[key] = { oldValue: orig[key], newValue: form[key] };
    }
  }
  const changeLog = { timestamp: Date.now(), sheet: '', rowIndex: 0, changes };
  return { success: { event: 'submitSuccess', timestamp: Date.now() }, changeLog, fileData: changeLog };
};
