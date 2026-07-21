export const BEHAVIOR_DSL_VERSION = '1.0';

export const BEHAVIOR_DSL_STATEMENTS = [
  { id: 'when', syntax: 'when $字段 <运算符> <值> -> <动作>', description: '字段变化且条件成立时执行动作。' },
  { id: 'else', syntax: 'else -> <动作>', description: '紧跟上一条 when，执行该条件的反向分支。' },
  { id: 'change', syntax: 'on change($字段) -> <动作>', description: '字段变化时执行动作。' },
  { id: 'compute', syntax: 'compute $目标 = <表达式> watch($字段, ...)', description: '任一监听字段变化时重算目标字段。' },
  { id: 'load', syntax: 'on load -> <动作>', description: '表单加载时执行动作。' },
  { id: 'before-submit', syntax: 'before submit -> <动作>', description: '提交前执行校验或准备动作。' },
  { id: 'submit', syntax: 'on submit -> <动作>', description: '表单提交事件发生时执行动作。' },
] as const;

export const BEHAVIOR_DSL_OPERATORS = [
  { syntax: '==', description: '严格相等', inverse: '!=' },
  { syntax: '!=', description: '不相等', inverse: '==' },
  { syntax: '>', description: '大于', inverse: '<=' },
  { syntax: '<', description: '小于', inverse: '>=' },
  { syntax: '>=', description: '大于等于', inverse: '<' },
  { syntax: '<=', description: '小于等于', inverse: '>' },
  { syntax: 'contains', description: '包含', inverse: 'not contains' },
  { syntax: 'not contains', description: '不包含', inverse: 'contains' },
  { syntax: 'starts with', description: '以指定文本开头', inverse: 'not starts with' },
  { syntax: 'not starts with', description: '不以指定文本开头', inverse: 'starts with' },
  { syntax: 'ends with', description: '以指定文本结尾', inverse: 'not ends with' },
  { syntax: 'not ends with', description: '不以指定文本结尾', inverse: 'ends with' },
  { syntax: 'is empty', description: '为空', inverse: 'is not empty' },
  { syntax: 'is not empty', description: '不为空', inverse: 'is empty' },
] as const;

export const BEHAVIOR_DSL_ACTIONS = [
  { name: 'show', syntax: 'show(@控件)', description: '显示一个或多个控件。', target: 'component' },
  { name: 'hide', syntax: 'hide(@控件)', description: '隐藏一个或多个控件。', target: 'component' },
  { name: 'enable', syntax: 'enable(@控件)', description: '启用一个或多个控件。', target: 'component' },
  { name: 'disable', syntax: 'disable(@控件)', description: '禁用一个或多个控件。', target: 'component' },
  { name: 'require', syntax: 'require($字段, ...)', description: '把字段设为必填。', target: 'field' },
  { name: 'optional', syntax: 'optional($字段, ...)', description: '取消字段必填。', target: 'field' },
  { name: 'clear', syntax: 'clear($字段, ...)', description: '清空字段值。', target: 'field' },
  { name: 'set', syntax: 'set($字段, <表达式>)', description: '设置字段值；第二个参数是安全表达式。', target: 'field' },
  { name: 'message', syntax: 'message("内容", info)', description: '显示 info / success / warning / error 消息。', target: 'none' },
  { name: 'run', syntax: 'run("流程ID")', description: '运行指定流程；run() 运行当前配置流程。', target: 'workflow' },
  { name: 'options', syntax: 'options($目标, "表ID", "筛选字段", <筛选值>)', description: '按数据表筛选条件刷新字段选项。', target: 'table' },
] as const;

export const BEHAVIOR_DSL_TEMPLATES = [
  { label: '条件显隐', value: 'when $部门 == "技术部" -> show(@技术栈); require($技术栈)\nelse -> hide(@技术栈); clear($技术栈)' },
  { label: '计算字段', value: 'compute $合计 = $数量 * $单价 watch($数量, $单价)' },
  { label: '级联选项', value: 'on change($省份) -> options($城市, "city_table", "省份", $省份)' },
  { label: '提交校验', value: 'before submit -> require($姓名, $手机号); message("请检查必填项", warning)' },
  { label: '流程调用', value: 'on change($状态) -> run("workflow_id")' },
] as const;

export const BEHAVIOR_DSL_KEYWORDS = ['when', 'else', 'on', 'change', 'compute', 'watch', 'load', 'before', 'submit', 'is', 'not', 'with'] as const;
export const BEHAVIOR_DSL_MESSAGE_LEVELS = ['info', 'success', 'warning', 'error'] as const;
