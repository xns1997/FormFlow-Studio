export function shouldAutoApproveOperation(mode: 'local' | 'cloud') {
  return mode === 'local';
}

export type ToolPolicyOutcome = {
  level: 'allowed' | 'correctable' | 'confirmation_required' | 'forbidden';
  reason: string;
  userMessage: string;
  alternatives: string[];
};

type PolicyTask = { title: string; instruction: string; acceptance: string[] };

export function evaluateToolPolicy(toolName: string, request: string, task: PolicyTask): ToolPolicyOutcome {
  if (!toolName.endsWith('.delete')) return { level: 'allowed', reason: 'non_destructive', userMessage: '操作符合当前目标范围。', alternatives: [] };
  if (/(?:不|不要|不得|禁止|不允许)(?:删除|覆盖)|不删除/.test(request)) return {
    level: 'forbidden', reason: 'explicit_user_constraint', userMessage: '用户已明确要求保留现有内容，不能执行删除。', alternatives: ['修改或复用现有资源', '新增资源并保留原内容'],
  };
  return {
    level: 'confirmation_required', reason: /删除|移除|清理|废弃/.test(`${task.title}\n${task.instruction}\n${task.acceptance.join('\n')}`) ? 'destructive_action_in_task' : 'destructive_action_requested',
    userMessage: '删除操作需要确认影响后才能执行。', alternatives: ['确认删除影响', '取消删除并改用更新或复用'],
  };
}

export function operationAllowedByPlan(toolName: string, request: string, task: PolicyTask) {
  return evaluateToolPolicy(toolName, request, task).level === 'allowed';
}
