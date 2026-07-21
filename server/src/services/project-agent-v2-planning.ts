export const PLANNING_MAX_ATTEMPTS = 2;

export function isStructuredPlanningError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /模型未返回合法的结构化 JSON|结构化输出不符合 Schema|规划模型未返回有效|规划任务角色边界无效|未限定项目|必须明确指定限定范围/.test(message);
}

export function planningRepairInstruction() {
  return '上一次规划结果无效。请重新独立生成完整结果，只输出一个 JSON 对象；不要输出 Markdown、解释、注释或尾随逗号。确保字符串中的换行已转义，并在输出前检查所有括号和引号闭合。任务必须严格按角色拆分：质量检查、质量门禁和回归测试属于 quality；项目包校验、输出和 release.preview 属于 delivery；不得把质量检查与发布预检合并到同一个任务。';
}

export function validatePlannerTaskRoleBoundaries(tasks: Array<{ id?: string; role?: string; title?: string; instruction?: string; access?: string; acceptance?: unknown[] }>) {
  for (const task of tasks) {
    const text = `${task.title || ''}\n${task.instruction || ''}\n${Array.isArray(task.acceptance) ? task.acceptance.join('\n') : ''}`;
    const scopedWork = `${task.title || ''}\n${task.instruction || ''}`;
    if (task.role !== 'quality' && (/project\.quality\.inspect/i.test(text) || /(?:执行|运行|开展|完成).{0,8}质量(?:检查|门禁)|质量门禁|执行.{0,8}回归测试/i.test(scopedWork))) {
      throw new Error(`规划任务角色边界无效：${task.id || task.title || '未命名任务'} 的质量检查必须由 quality 专家执行并独立成任务`);
    }
    if (task.role !== 'delivery' && /release\.preview|发布预检/i.test(text)) {
      throw new Error(`规划任务角色边界无效：${task.id || task.title || '未命名任务'} 的发布预检必须由 delivery 专家执行并独立成任务`);
    }
    if (task.role === 'quality' && task.access === 'write' && (/(?:修复|修改|配置).{0,30}(?:forms\.|表单|按钮|控件)|(?:forms\.|表单|按钮|控件).{0,30}(?:修复|修改|配置)/i.test(scopedWork))) {
      throw new Error(`规划任务角色边界无效：${task.id || task.title || '未命名任务'} 的表单资源修复必须由 form 专家执行，quality 只能独立复检`);
    }
  }
  return { valid: true };
}
