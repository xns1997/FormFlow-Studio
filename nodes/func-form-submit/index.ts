import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args) => {
  const [trigger, formData, originalData] = args;
  const form = (formData as Record<string, unknown>) || {};
  const orig = (originalData as Record<string, unknown>) || {};
  const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
  for (const key of Object.keys(form)) {
    if (JSON.stringify(form[key]) !== JSON.stringify(orig[key])) {
      changes[key] = { oldValue: orig[key], newValue: form[key] };
    }
  }
  const changeLog = { timestamp: Date.now(), changes, count: Object.keys(changes).length };
  return { success: { event: 'submitSuccess', timestamp: Date.now() }, changeLog };
};
