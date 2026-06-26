import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, formData] = args;
  const form = (formData as Record<string, unknown>) || {};
  const fields = (props.fields as string || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const targetFields = fields.length > 0 ? fields : Object.keys(form);
  const errors: Record<string, string> = {};
  for (const field of targetFields) {
    const val = form[field];
    if (val === null || val === undefined || val === '') {
      errors[field] = `${field} 为必填项`;
    }
  }
  const isValid = Object.keys(errors).length === 0;
  return {
    passed: isValid ? { event: 'validatePassed', timestamp: Date.now() } : undefined,
    failed: !isValid ? { event: 'validateFailed', timestamp: Date.now() } : undefined,
    errors, isValid,
  };
};
