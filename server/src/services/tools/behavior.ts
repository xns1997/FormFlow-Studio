/**
 * Behavior and rule tools.
 */
import { assertRevision, requireProject, toolError } from '../project-authoring';
import { applyBehaviorDslToComponents, boundedModelCheck, DEFAULT_DOMAIN, hasBehaviorDslErrors, involvedFields, verifyDeterminism } from '../../../../shared/formflow-core/behaviorDsl';
import { formContext, lintRuleCode, readRuleReference, runRuleSandbox } from '../rule-agent';
import { behaviorListInputSchema, behaviorRuleSchema } from '../tool-shared';
import type { RegisterFn, ToolHelpers } from './types';

/** 注册行为域工具（规则代码/测试/形式化验证）。 */
export function registerBehaviorTools(register: RegisterFn, h: ToolHelpers) {
  const { projectId, findById, upsert, remove } = h;
  register({ name: 'behavior.list', title: '行为列表', description: '按 global/sheet/form 作用域列出行为；form 必须传 formId，sheet 必须传 tableId 和 sheetName。', inputSchema: behaviorListInputSchema, risk: 'read', requiredAccess: 'view', examples: [{ summary: '列出表单行为', arguments: { projectId: 'device_mgmt', scope: 'form', formId: 'device_edit' } }], handler: (input, context) => {
    const project = requireProject(projectId(input, context));
    if (input.scope === 'global') return project.globalBehaviors || [];
    if (input.scope === 'form') { if (!input.formId) throw toolError('REQUIRED_ARGUMENT', 'scope=form 时缺少参数 formId', 'formId'); return findById(project.forms || [], input.formId, 'FORM_NOT_FOUND').behaviors || []; }
    if (input.scope === 'sheet') { if (!input.tableId) throw toolError('REQUIRED_ARGUMENT', 'scope=sheet 时缺少参数 tableId', 'tableId'); if (!input.sheetName) throw toolError('REQUIRED_ARGUMENT', 'scope=sheet 时缺少参数 sheetName', 'sheetName'); return (project.sheetBehaviors || []).find((item: any) => item.tableId === input.tableId && item.sheetName === input.sheetName)?.behaviors || []; }
    throw toolError('INVALID_ARGUMENT', 'scope 必须是 global、sheet 或 form', 'scope');
  } });
  register({ name: 'behavior.upsert', title: '保存结构化行为', description: '在 global/sheet/form 作用域保存完整 Trigger/Condition/Action 行为。表单字段联动优先使用 rule_code.update；禁止空 expression 占位。', inputSchema: h.schema(['projectId', 'scope', 'behavior', 'baseRevision', 'idempotencyKey'], { projectId: h.string, scope: { type: 'string', enum: ['global', 'sheet', 'form'] }, behavior: behaviorRuleSchema, baseRevision: h.string, idempotencyKey: h.string, formId: h.string, tableId: h.string, sheetName: h.string }), risk: 'write', requiredAccess: 'edit', examples: [{ summary: '在表单保存一条字段变化行为', arguments: { projectId: 'device_mgmt', scope: 'form', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'beh-1', behavior: { id: 'beh_score_guard', name: '评分低于60提示', trigger: { type: 'submit' }, conditions: [], actions: [{ type: 'showMessage', messageType: 'warning', message: '评分过低' }] } } }], handler: (input, context) => { const project = requireProject(projectId(input, context)); assertRevision(project, input.baseRevision); let collection: any[]; if (input.scope === 'global') collection = project.globalBehaviors ||= []; else if (input.scope === 'form') collection = findById(project.forms || [], input.formId, 'FORM_NOT_FOUND').behaviors ||= []; else { let entry = (project.sheetBehaviors ||= []).find((item: any) => item.tableId === input.tableId && item.sheetName === input.sheetName); if (!entry) { entry = { tableId: input.tableId, sheetName: input.sheetName, behaviors: [], updatedAt: new Date().toISOString() }; project.sheetBehaviors.push(entry); } collection = entry.behaviors; } upsert(collection, { enabled: true, priority: 20, conditions: [], ...input.behavior, updatedAt: new Date().toISOString() }); project.config.updatedAt = new Date().toISOString(); return h.commitProject(project); } });
  register({ name: 'behavior.delete', title: '删除行为', description: '从指定作用域删除行为。', inputSchema: h.schema(['projectId', 'scope', 'id', 'baseRevision', 'idempotencyKey'], { projectId: h.string, scope: { type: 'string', enum: ['global', 'sheet', 'form'] }, id: h.string, baseRevision: h.string, idempotencyKey: h.string, formId: h.string, tableId: h.string, sheetName: h.string, confirmationToken: h.string }), risk: 'destructive', requiredAccess: 'edit', impact: (input) => ({ scope: input.scope, behaviorId: input.id }), examples: [{ summary: '删除表单行为（需确认）', arguments: { projectId: 'device_mgmt', scope: 'form', formId: 'device_edit', id: 'beh_score_guard', baseRevision: '<revision>', idempotencyKey: 'beh-del-1' } }], handler: (input, context) => { const project = requireProject(projectId(input, context)); assertRevision(project, input.baseRevision); let collection: any[] = project.globalBehaviors || []; if (input.scope === 'form') collection = findById(project.forms || [], input.formId, 'FORM_NOT_FOUND').behaviors || []; else if (input.scope === 'sheet') collection = (project.sheetBehaviors || []).find((item: any) => item.tableId === input.tableId && item.sheetName === input.sheetName)?.behaviors || []; remove(collection, input.id); project.config.updatedAt = new Date().toISOString(); return h.commitProject(project); } });
  register({ name: 'rule_code.update', title: '更新表单规则', description: '校验 Behavior Rule DSL，通过后写入表单并编译为可执行的控件联动。', inputSchema: h.schema(['projectId', 'formId', 'code', 'baseRevision', 'idempotencyKey'], { projectId: h.string, formId: h.string, code: h.string, baseRevision: h.string, idempotencyKey: h.string }), risk: 'write', requiredAccess: 'edit', examples: [{ summary: '写两条合法规则（条件提示 + 提交前范围校验）', arguments: { projectId: 'device_mgmt', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'rule-1', code: 'when $状态 == "停用" -> message("该设备已停用", warning)\nbefore submit -> range($评分, 60, 999)' }, success: { revision: '…' }, errors: [{ code: 'RULE_SYNTAX_INVALID', message: '规则语法或引用校验失败（diagnostics 含逐条问题；require/range/validate 参数是字段引用或数值，不是表达式）' }, { code: 'RULE_APPLY_FAILED', message: '规则无法应用到控件（字段/组件引用错误）' }] }], handler: (input, context) => { const project = requireProject(projectId(input, context)); assertRevision(project, input.baseRevision); const form = findById(project.forms || [], input.formId, 'FORM_NOT_FOUND'); const compilation = lintRuleCode(project.config.id, form.id, String(input.code || '')); if (hasBehaviorDslErrors(compilation)) throw toolError('RULE_SYNTAX_INVALID', '规则语法或引用校验失败', 'code', compilation.diagnostics); const applied = applyBehaviorDslToComponents(form.design?.components || [], String(input.code || ''), form.design?.formWindow); if (applied.unapplied.length) throw toolError('RULE_APPLY_FAILED', applied.unapplied[0], 'code', applied.unapplied); const now = new Date().toISOString(); form.ruleCode = String(input.code || ''); form.design.components = applied.components; form.design.formWindow = applied.formWindow || form.design.formWindow; form.design.updatedAt = now; form.updatedAt = now; project.config.updatedAt = now; return h.commitProject(project); } });
  register({ name: 'rule_syntax.lint', title: '规则语法检查', description: '检查 FormFlow 受控规则 DSL。', inputSchema: h.schema(['formId', 'code'], { projectId: h.string, formId: h.string, code: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '检查规则语法', arguments: { projectId: 'device_mgmt', formId: 'device_edit', code: 'when $状态 == "停用" -> setReadonly($评分)' } }], handler: (input, context) => lintRuleCode(projectId(input, context), input.formId, input.code) });
  register({ name: 'rule_test.run', title: '规则隔离测试', description: '在隔离沙箱运行规则测试。', inputSchema: h.schema(['formId', 'code'], { projectId: h.string, formId: h.string, code: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '在沙箱测试规则', arguments: { projectId: 'device_mgmt', formId: 'device_edit', code: 'when $状态 == "停用" -> setReadonly($评分)' } }], handler: (input, context) => runRuleSandbox(projectId(input, context), input.formId, input.code) });
  register({ name: 'rule_verify.model', title: '规则形式化验证（有界模型检查）', description: '对表单规则做有界显式状态模型检查与确定性抽查：验证事件触发链终止（无无限循环）、迁移一致，并附静态诊断摘要。', inputSchema: h.schema(['formId'], { projectId: h.string, formId: h.string, code: h.string }), risk: 'read', requiredAccess: 'view', examples: [{ summary: '验证表单已写入的规则', arguments: { projectId: 'device_mgmt', formId: 'device_edit' }, success: { passed: true, acyclic: true, deterministic: true, statesExplored: 120, ruleCount: 2 }, errors: [{ code: 'FORM_NOT_FOUND', message: '表单不存在' }] }], handler: (input, context) => {
    const pid = projectId(input, context);
    const ctx = formContext(pid, input.formId);
    const source = input.code !== undefined ? String(input.code) : String(ctx.form.ruleCode || '');
    const compilation = lintRuleCode(pid, input.formId, source);
    const errors = compilation.diagnostics.filter((item) => item.severity === 'error');
    const rules = compilation.rules;
    if (!rules.length) {
      return {
        formId: input.formId,
        compiled: errors.length === 0,
        ruleCount: 0,
        passed: errors.length === 0,
        staticDiagnostics: compilation.diagnostics,
        acyclic: true,
        deterministic: true,
        statesExplored: 0,
        notes: errors.length ? [] : ['没有可验证的规则'],
      };
    }
    const check = boundedModelCheck(rules);
    const fields = involvedFields(rules);
    const baseValues = Object.fromEntries(fields.map((field) => [field, DEFAULT_DOMAIN[0]]));
    const events: Array<{ type: string; field?: string; value?: unknown; buttonName?: string }> = [
      ...fields.flatMap((field) => DEFAULT_DOMAIN.slice(0, 2).map((value) => ({ type: 'fieldChange', field, value }))),
      { type: 'formLoad' },
      { type: 'submit' },
    ];
    const deterministic = events.every((event) => verifyDeterminism(rules, baseValues, event as any));
    const passed = errors.length === 0 && check.acyclic && deterministic;
    return {
      formId: input.formId,
      compiled: true,
      ruleCount: rules.length,
      passed,
      staticDiagnostics: compilation.diagnostics,
      acyclic: check.acyclic,
      deterministic,
      statesExplored: check.statesExplored,
      counterexample: check.counterexample,
      notes: check.notes,
    };
  } });
  register({ name: 'rule_reference.search', title: '规则参考搜索', description: '搜索权威规则语法参考。', inputSchema: h.schema(['query'], { query: h.string }), risk: 'read', examples: [{ summary: '搜索 setReadonly 语法', arguments: { query: 'setReadonly' } }], handler: (input) => readRuleReference(input.query) });
}
