import type {
  TriggerType, ConditionConfig, ActionConfig, BehaviorRule,
  BehaviorDslDiagnostic, BehaviorDslCompileContext, BehaviorDslCompilation,
} from './types';
import { parseLine } from './grammar';
import { validateActionCall } from './signatures';
import { runStaticAnalysis } from './staticAnalysis';
import {
  OPERATOR_MAP, INVERSE_OPERATOR, stripComment, splitTopLevel, literal,
  normalizeReference, isFieldReference, fieldRef, componentRef, parseRefs,
  parseCondition, parseCanonicalAction, parseLegacyAction, inverseCondition,
  createRule, diagnostic, lintRules,
} from './parserRegex';

export {
  OPERATOR_MAP, INVERSE_OPERATOR, stripComment, splitTopLevel, literal,
  normalizeReference, isFieldReference, fieldRef, componentRef, parseRefs,
  parseCondition, parseCanonicalAction, parseLegacyAction, inverseCondition,
  createRule, diagnostic, lintRules,
};

export interface ParsedActions { actions: ActionConfig[]; diagnostics: Array<{ message: string; code: string; severity: 'error' | 'warning' | 'info'; suggestion?: string }>; }

/**
 * 解析动作列表（FFR101/FFR002 与旧实现一致）：
 * - FFR307：动作参数槽类型不匹配（$/@ 引用种类错误、数值槽非数字、级别/运算符非法）；
 * - FFR308：动作语境违规（UI 动作出现在守卫语境等）。
 */
export function parseActions(source: string, mode: 'default' | 'guard' = 'default'): ParsedActions {
  const actions: ActionConfig[] = [];
  const diagnostics: ParsedActions['diagnostics'] = [];
  let phrases = splitTopLevel(source, ';');
  if (phrases.length === 1 && !parseCanonicalAction(phrases[0], mode)) phrases = splitTopLevel(source, ',;');
  for (const phrase of phrases) {
    const canonical = parseCanonicalAction(phrase, mode);
    if (canonical) {
      for (const issue of validateActionCall(phrase, mode)) {
        diagnostics.push({ severity: 'error', code: issue.code, message: issue.message });
      }
      actions.push(...canonical);
      continue;
    }
    const legacy = parseLegacyAction(phrase);
    if (legacy) {
      actions.push(...legacy.actions);
      diagnostics.push({ severity: 'warning', code: 'FFR101', message: `旧式动作语法"${phrase}"仍可读取，建议改为函数式动作。`, suggestion: legacy.suggestion });
    } else diagnostics.push({ severity: 'error', code: 'FFR002', message: `不支持的动作"${phrase}。` });
  }
  return { actions, diagnostics };
}

function actionColumn(line: string): number {
  return line.indexOf('->') + 3;
}

/**
 * 用 Chevrotain 可执行文法编译 DSL（与旧正则实现差分对拍，行为逐字节对齐；
 * 新增的 FFR304-309 静态检查在 lintRules 之后追加）。
 */
export function compileBehaviorDsl(source: string, context: BehaviorDslCompileContext = {}): BehaviorDslCompilation {
  const rules: BehaviorRule[] = [];
  const diagnostics: BehaviorDslDiagnostic[] = [];
  const preview: string[] = [];
  let previousConditional: { condition: ConditionConfig; trigger: BehaviorRule['trigger']; line: number } | null = null;
  const lines = source.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    let line = stripComment(raw).trim();
    if (!line) return;

    // 旧语法 otherwise → else（FFR100）
    let legacyOtherwise = false;
    if (/^otherwise\s*->/i.test(line)) {
      legacyOtherwise = true;
      diagnostics.push(diagnostic(lineNumber, 'FFR100', 'otherwise 是旧写法，请改用 else。', 'warning', 1, line.replace(/^otherwise/i, 'else')));
      line = line.replace(/^otherwise/i, 'else');
    }

    const parsed = parseLine(line);
    const statement = parsed?.statement;
    if (!statement) {
      diagnostics.push(diagnostic(lineNumber, 'FFR000', '无法识别这条规则。'));
      previousConditional = null;
      return;
    }

    switch (statement.kind) {
      case 'when': {
        const condition = parseCondition(statement.conditionText);
        const parsedActions = parseActions(statement.actionsText);
        if (!condition) diagnostics.push(diagnostic(lineNumber, 'FFR001', '条件格式无效；条件必须以字段引用开头，并使用受支持的运算符。'));
        parsedActions.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, actionColumn(line), item.suggestion)));
        if (!/^\$(?:form\.)?/.test(statement.conditionText.trim())) {
          diagnostics.push(diagnostic(lineNumber, 'FFR102', '条件字段应使用 $字段 引用。', 'warning', 6, condition ? `when ${fieldRef(condition.fieldName)}${statement.conditionText.slice(statement.conditionText.search(/\s/))} -> ${statement.actionsText}` : undefined));
        }
        if (condition && parsedActions.actions.length) {
          const trigger = { type: 'fieldChange' as TriggerType, fieldName: condition.fieldName };
          rules.push(createRule(`dsl_${lineNumber}`, `当 ${statement.conditionText}`, trigger, [condition], parsedActions.actions));
          previousConditional = { condition, trigger, line: lineNumber };
          preview.push(`字段"${condition.fieldName}"变化且条件成立时，执行 ${parsedActions.actions.length} 个动作。`);
        }
        return;
      }
      case 'else': {
        const parsedActions = parseActions(statement.actionsText);
        if (!previousConditional) diagnostics.push(diagnostic(lineNumber, 'FFR003', 'else 前需要一条相邻的 when 规则。'));
        parsedActions.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, 1, item.suggestion)));
        if (previousConditional && parsedActions.actions.length) {
          rules.push(createRule(`dsl_${lineNumber}`, `否则（对应第 ${previousConditional.line} 行）`, previousConditional.trigger, [inverseCondition(previousConditional.condition)], parsedActions.actions));
          preview.push(`否则执行 ${parsedActions.actions.length} 个动作。`);
        }
        return;
      }
      case 'compute': {
        const target = normalizeReference(statement.targetText);
        const fields = parseRefs(statement.fieldsText);
        if (statement.watchMarker !== 'watch') {
          diagnostics.push(diagnostic(lineNumber, 'FFR103', 'compute 的旧式 on change 已改为 watch。', 'warning', 1, `compute ${fieldRef(target)} = ${statement.exprText.trim()} watch(${fields.map(fieldRef).join(', ')})`));
        }
        if (!fields.length) diagnostics.push(diagnostic(lineNumber, 'FFR004', 'compute 至少需要一个监听字段。'));
        if (new Set(fields).size !== fields.length) diagnostics.push(diagnostic(lineNumber, 'FFR301', 'watch 中存在重复字段，编译时只会监听一次。', 'warning'));
        if (!/^\$/.test(statement.targetText.trim()) || fields.some((field) => !statement.fieldsText.includes(`$${field}`))) {
          diagnostics.push(diagnostic(lineNumber, 'FFR102', 'compute 目标和 watch 字段应使用 $字段 引用。', 'warning'));
        }
        [...new Set(fields)].forEach((fieldName, fieldIndex) => {
          rules.push(createRule(`dsl_${lineNumber}_${fieldIndex}`, `计算 ${target}`, { type: 'fieldChange', fieldName }, [], [{ type: 'setValue', targetField: target, expression: statement.exprText.trim() }]));
        });
        if (fields.length) preview.push(`${[...new Set(fields)].join('、')}变化时，重新计算"${target}"。`);
        previousConditional = null;
        return;
      }
      case 'onChange': {
        const field = normalizeReference(statement.fieldText);
        const parsedActions = parseActions(statement.actionsText);
        if (statement.legacy) {
          diagnostics.push(diagnostic(lineNumber, 'FFR104', '字段变化触发器应写为 on change($字段)。', 'warning', 1, `on change(${fieldRef(field)}) -> ${statement.actionsText}`));
        }
        parsedActions.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, 1, item.suggestion)));
        if (parsedActions.actions.length) rules.push(createRule(`dsl_${lineNumber}`, `${field}变化`, { type: 'fieldChange', fieldName: field }, [], parsedActions.actions));
        previousConditional = null;
        return;
      }
      case 'beforeClick': {
        const parsedActions = parseActions(statement.actionsText, 'guard');
        parsedActions.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, 1, item.suggestion)));
        if (parsedActions.actions.length) {
          rules.push(createRule(`dsl_${lineNumber}`, `before click(${statement.buttonName})`, { type: 'buttonClick', buttonName: normalizeReference(statement.buttonName) }, [], parsedActions.actions));
        }
        previousConditional = null;
        return;
      }
      case 'lifecycle': {
        const event = statement.event;
        const name = statement.rawName;
        const parsedActions = parseActions(statement.actionsText, event === 'beforeSubmit' ? 'guard' : 'default');
        parsedActions.diagnostics.forEach((item) => diagnostics.push(diagnostic(lineNumber, item.code, item.message, item.severity, 1, item.suggestion)));
        if (parsedActions.actions.length) rules.push(createRule(`dsl_${lineNumber}`, name, { type: event as TriggerType }, [], parsedActions.actions));
        previousConditional = null;
        return;
      }
      default: {
        diagnostics.push(diagnostic(lineNumber, 'FFR000', '无法识别这条规则。'));
        previousConditional = null;
      }
    }
  });
  diagnostics.push(...lintRules(rules, context, lines));
  diagnostics.push(...runStaticAnalysis(rules, context));
  return { rules, diagnostics, preview };
}

export function hasBehaviorDslErrors(compilation: Pick<BehaviorDslCompilation, 'diagnostics'>) { return compilation.diagnostics.some((item) => item.severity === 'error'); }

export function behaviorRulesToNaturalLanguage(rules: BehaviorRule[]) {
  return rules.map((rule) => { const trigger = rule.trigger.fieldName ? `${rule.trigger.fieldName}发生${rule.trigger.type}` : `发生${rule.trigger.type}`; const condition = rule.conditions.length ? `，满足 ${rule.conditions.map((item) => `${item.fieldName} ${item.operator} ${String(item.value ?? '')}`).join(' 且 ')}` : ''; return `${trigger}${condition}，执行 ${rule.actions.map((action) => action.type).join('、')}。`; });
}
