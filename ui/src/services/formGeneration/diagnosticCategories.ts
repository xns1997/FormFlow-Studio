/**
 * Diagnostic categories with cause analysis and fix suggestions.
 * Extends formDiagnostics with human-readable error explanations.
 */

export interface DiagnosticCategory {
  id: string;
  label: string;
  icon: string;
}

export interface DiagnosticFix {
  label: string;
  description: string;
  auto?: boolean;
  props?: Record<string, unknown>;
}

export interface DiagnosticExplanation {
  cause: string;
  impact: string;
  fixes: DiagnosticFix[];
  learnMore?: string;
}

/** 诊断 ID → 分类定义（标题/严重级/修复提示）。 */
export const DIAGNOSTIC_CATEGORIES: Record<string, DiagnosticCategory> = {
  'field-binding': { id: 'field-binding', label: '数据绑定', icon: '🔗' },
  'validation': { id: 'validation', label: '校验规则', icon: '✓' },
  'linkage': { id: 'linkage', label: '联动规则', icon: '↔' },
  'workflow': { id: 'workflow', label: '流程配置', icon: '⚙' },
  'data-source': { id: 'data-source', label: '数据源', icon: '📊' },
  'button': { id: 'button', label: '按钮动作', icon: '🔘' },
  'layout': { id: 'layout', label: '布局', icon: '📐' },
  'performance': { id: 'performance', label: '性能', icon: '⚡' },
};

const EXPLANATIONS: Record<string, DiagnosticExplanation> = {
  'missing-name': {
    cause: '控件没有设置字段名称，运行时无法识别和保存数据。',
    impact: '用户填写的数据将无法保存到数据表。',
    fixes: [
      { label: '自动生成字段名', description: '从标签名自动生成稳定的字段标识', auto: true },
      { label: '手动设置字段名', description: '在属性面板中手动输入字段名' },
    ],
  },
  'duplicate': {
    cause: '两个控件使用了相同的字段名，运行时数据会互相覆盖。',
    impact: '后写入的值会覆盖先写入的值，导致数据丢失。',
    fixes: [
      { label: '重命名字段', description: '修改其中一个控件的字段名使其唯一' },
    ],
  },
  'unbound': {
    cause: '控件有字段名但没有显式绑定到数据源。',
    impact: '数据只能在表单内使用，无法自动写入数据表。',
    fixes: [
      { label: '绑定到同名表单字段', description: '自动创建双向数据绑定', auto: true },
    ],
  },
  'required-hint': {
    cause: '必填字段没有提供输入提示或默认值，用户可能不知道该填什么。',
    impact: '用户提交时可能频繁遇到必填校验错误。',
    fixes: [
      { label: '添加输入提示', description: '自动添加占位提示文本', auto: true },
    ],
  },
  'button-action': {
    cause: '按钮没有配置任何动作（事件脚本或流程触发器）。',
    impact: '点击按钮不会执行任何操作。',
    fixes: [
      { label: '配置提交流程', description: '将按钮绑定到数据保存流程' },
      { label: '添加事件脚本', description: '在事件面板中编写按钮点击逻辑' },
    ],
  },
  'invalid-flow': {
    cause: '流程触发器已启用但没有选择具体的流程。',
    impact: '点击按钮会报错。',
    fixes: [
      { label: '选择流程', description: '在触发器配置中选择一个已有流程' },
      { label: '创建新流程', description: '新建一个处理流程并绑定' },
    ],
  },
  'missing-flow': {
    cause: '按钮引用的流程已被删除或不存在。',
    impact: '点击按钮会报错。',
    fixes: [
      { label: '重新选择流程', description: '选择一个存在的流程' },
      { label: '移除触发器', description: '删除无效的流程触发器配置' },
    ],
  },
  'write-conflict': {
    cause: '同一触发事件用不同规则写入同一目标字段。',
    impact: '字段值会被不确定地覆盖，结果不可预测。',
    fixes: [
      { label: '合并规则', description: '将冲突的规则合并为一条' },
      { label: '调整条件', description: '确保不同条件不会同时匹配' },
    ],
  },
  'linkage-cycle': {
    cause: '联动规则形成循环依赖（A→B→C→A）。',
    impact: '运行时会反复触发，可能导致界面卡死。',
    fixes: [
      { label: '断开循环', description: '移除循环链中的某条规则' },
    ],
  },
  'broken-edge': {
    cause: '流程图中的连线引用了不存在的节点。',
    impact: '流程执行会中断。',
    fixes: [
      { label: '删除无效连线', description: '移除引用不存在节点的连线' },
      { label: '重新创建节点', description: '创建缺失的节点并重新连接' },
    ],
  },
  'invalid-key': {
    cause: '数据表的主键包含空值或重复值。',
    impact: '无法可靠地写回数据，可能导致数据覆盖或丢失。',
    fixes: [
      { label: '修复主键数据', description: '在数据表中修复空值和重复值' },
      { label: '更换主键字段', description: '选择一个唯一且非空的字段作为主键' },
    ],
  },
  'empty-form': {
    cause: '表单还没有任何控件，无法录入或展示数据。',
    impact: '预览时只有一个空表单，用户无法填写任何内容。',
    fixes: [
      { label: '添加默认输入框', description: '一键在表单顶部添加文本输入控件', auto: true },
      { label: '从模板创建', description: '使用模板快速搭建完整表单' },
    ],
  },
  'select-no-options': {
    cause: '下拉/多选/单选控件没有配置任何选项。',
    impact: '用户无法选择任何值，字段形同虚设。',
    fixes: [
      { label: '添加默认选项', description: '从数据列样本生成，或添加占位选项', auto: true },
      { label: '配置动态选项', description: '绑定数据列作为动态选项来源' },
    ],
  },
  'off-canvas': {
    cause: '控件位于表单可视区域之外，可能被整体拖出或窗口缩小导致。',
    impact: '预览时看不到或无法操作该控件。',
    fixes: [
      { label: '移回表单内', description: '自动将控件移入可视区域', auto: true },
    ],
  },
  'missing-key': {
    cause: '表单用到的数据表没有配置主键。',
    impact: '写入数据时无法定位已有记录，可能导致重复或覆盖。',
    fixes: [
      { label: '自动选择主键', description: '从数据中挑选唯一且非空的列作为主键', auto: true },
      { label: '前往数据工作区', description: '手动配置主键或修复数据' },
    ],
  },
};

/** 获取诊断解释（含修复建议）。 */
export function getDiagnosticExplanation(diagnosticId: string): DiagnosticExplanation | undefined {
  const prefix = diagnosticId.split(':')[0];
  return EXPLANATIONS[prefix] || EXPLANATIONS[diagnosticId];
}

const CATEGORY_MAP: Record<string, string> = {
  'missing-name': 'field-binding',
  'duplicate': 'field-binding',
  'unbound': 'field-binding',
  'required-hint': 'validation',
  'write-conflict': 'linkage',
  'linkage-cycle': 'linkage',
  'button-action': 'button',
  'invalid-flow': 'workflow',
  'missing-flow': 'workflow',
  'broken-edge': 'workflow',
  'invalid-key': 'data-source',
  'empty-form': 'layout',
  'select-no-options': 'data-source',
  'off-canvas': 'layout',
  'missing-key': 'data-source',
};

/** 获取诊断分类（未知回退通用）。 */
export function getDiagnosticCategory(diagnosticId: string): DiagnosticCategory {
  const prefix = diagnosticId.split(':')[0];
  const categoryId = CATEGORY_MAP[prefix] || 'layout';
  return DIAGNOSTIC_CATEGORIES[categoryId] || DIAGNOSTIC_CATEGORIES['layout'];
}
