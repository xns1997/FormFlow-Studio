export function shouldAutoApproveOperation(mode: 'local' | 'cloud') {
  return mode === 'local';
}

export function operationAllowedByPlan(toolName: string, request: string, task: { title: string; instruction: string; acceptance: string[] }) {
  if (!toolName.endsWith('.delete')) return true;
  if (/(?:不|不要|不得|禁止|不允许)(?:删除|覆盖)|不删除/.test(request)) return false;
  return /删除|移除/.test(`${task.title}\n${task.instruction}\n${task.acceptance.join('\n')}`);
}
