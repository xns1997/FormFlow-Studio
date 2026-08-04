import type { BehaviorRule } from './types';
import {
  createReferenceState, evaluateConditionsValue, applyAction, applyGuardAction,
  matchesEvent, type ReferenceEvent, type ReferenceState,
} from './referenceSemantics';

/**
 * TS 有界显式状态模型检查器（Phase 3）。
 *
 * 在有限抽象状态空间（≤4 字段、小值域）上做 BFS：
 * - 终止性：若状态（字段值 + 待处理事件队列）重复出现，说明事件触发链可能无限循环，
 *   产出反例路径并自动转回归用例；
 * - 确定性：迁移函数为纯函数，重复执行结果必须一致。
 *
 * 模型检查用于“找反例”，不追求无限状态证明（计划 §2.3）。
 */

export interface ModelCheckOptions {
  fields?: string[];
  domains?: Record<string, unknown[]>;
  maxDepth?: number;
  maxStates?: number;
}

export interface ModelCheckResult {
  acyclic: boolean;
  statesExplored: number;
  counterexample?: Array<{ values: Record<string, unknown>; queue: string[] }>;
  notes: string[];
}

export const DEFAULT_DOMAIN = [0, 1, '', 'x'];

export function involvedFields(rules: BehaviorRule[]): string[] {
  const set = new Set<string>();
  for (const rule of rules) {
    if (rule.trigger.fieldName) set.add(rule.trigger.fieldName);
    for (const condition of rule.conditions) if (condition.fieldName) set.add(condition.fieldName);
    for (const action of rule.actions) {
      if (action.targetField) set.add(action.targetField);
      if (action.sourceField) set.add(action.sourceField);
      if (action.expression) {
        for (const match of action.expression.matchAll(/\$(?:form\.)?([\w一-鿿.-]+)/g)) set.add(match[1]);
      }
    }
  }
  return [...set].slice(0, 4);
}

interface AbstractState {
  values: Record<string, unknown>;
  queue: ReferenceEvent[];
  guardFailures: number;
  messages: number;
  workflowRuns: number;
  path: Array<{ values: Record<string, unknown>; queue: string[] }>;
  ancestors: Set<string>;
}

function queueSignature(queue: ReferenceEvent[]): string {
  return queue.map((event) => `${event.type}:${event.field ?? ''}:${JSON.stringify(event.value)}`).join('|');
}

function step(
  state: AbstractState,
  rules: BehaviorRule[],
): { next: AbstractState | null; wroteFields: string[] } {
  const queue = [...state.queue];
  const event = queue.shift();
  if (!event) return { next: null, wroteFields: [] };
  const reference = createReferenceState({ ...state.values });
  reference.guardFailures.length = 0;
  // 复用参考解释器的单步语义：先写值，再按 priority 稳定顺序执行命中规则
  if (event.type === 'fieldChange' && event.field !== undefined) {
    reference.formValues = { ...reference.formValues, [event.field]: event.value };
  }
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
  const isGuard = event.type === 'buttonClick' || event.type === 'beforeSubmit';
  const wroteFields: string[] = [];
  for (const rule of sorted) {
    if (!matchesEvent(rule, event)) continue;
    if (!evaluateConditionsValue(rule.conditions, reference.formValues)) continue;
    for (const action of rule.actions) {
      applyAction(action, reference);
      if (action.targetField && (action.type === 'setValue' || action.type === 'clearValue')) wroteFields.push(action.targetField);
      if (isGuard) {
        const before = reference.guardFailures.length;
        applyGuardAction(action, reference);
        if (reference.guardFailures.length > before) break;
      }
    }
  }
  const nextQueue = [...queue];
  const seen = new Set<string>();
  for (const field of wroteFields) {
    if (seen.has(field)) continue;
    seen.add(field);
    nextQueue.push({ type: 'fieldChange', field, value: reference.formValues[field] });
  }
  const nextState: AbstractState = {
    values: { ...reference.formValues },
    queue: nextQueue,
    guardFailures: state.guardFailures + reference.guardFailures.length,
    messages: state.messages + reference.messages.length,
    workflowRuns: state.workflowRuns + reference.workflowRuns.length,
    path: [...state.path, { values: { ...state.values }, queue: [queueSignature([event, ...queue])] }],
    ancestors: state.ancestors,
  };
  return { next: nextState, wroteFields };
}

export function boundedModelCheck(rules: BehaviorRule[], options: ModelCheckOptions = {}): ModelCheckResult {
  const fields = options.fields?.length ? options.fields : involvedFields(rules);
  const domains: Record<string, unknown[]> = {};
  for (const field of fields) domains[field] = options.domains?.[field] || DEFAULT_DOMAIN;
  const maxDepth = options.maxDepth ?? 14;
  const maxStates = options.maxStates ?? 4000;
  const notes: string[] = [];
  const seen = new Set<string>();

  const initialEvents: ReferenceEvent[] = [
    ...fields.flatMap((field) => domains[field].map((value) => ({ type: 'fieldChange' as const, field, value }))),
    { type: 'formLoad' },
    { type: 'beforeSubmit' },
    { type: 'submit' },
  ];
  const frontier: AbstractState[] = initialEvents.map((event) => ({
    values: Object.fromEntries(fields.map((field) => [field, domains[field][0]])),
    queue: [event],
    guardFailures: 0,
    messages: 0,
    workflowRuns: 0,
    path: [],
    ancestors: new Set<string>(),
  }));
  let statesExplored = 0;
  let counterexample: ModelCheckResult['counterexample'];

  while (frontier.length > 0) {
    if (statesExplored >= maxStates) {
      notes.push(`状态数达到上限 ${maxStates}，未能在有限预算内完成（视为存疑，不判定为循环）`);
      return { acyclic: false, statesExplored, notes };
    }
    const state = frontier.shift()!;
    if (state.path.length > maxDepth) {
      counterexample = state.path;
      notes.push(`深度达到上限 ${maxDepth} 且事件队列非空，疑似无限触发链`);
      break;
    }
    const { next } = step(state, rules);
    if (!next) continue;
    const signature = `${JSON.stringify(next.values)}::${queueSignature(next.queue)}`;
    if (next.queue.length > 0) {
      // 真正的循环 = 新状态出现在当前路径的祖先链上（跨路径合并不是循环）
      if (state.ancestors.has(signature)) {
        counterexample = next.path;
        notes.push(`路径内状态重复出现：${signature.slice(0, 80)}`);
        break;
      }
      next.ancestors = new Set(state.ancestors);
      next.ancestors.add(signature);
    }
    if (seen.has(signature)) continue;
    seen.add(signature);
    frontier.push(next);
    statesExplored += 1;
  }

  return {
    acyclic: !counterexample,
    statesExplored,
    counterexample,
    notes,
  };
}

/**
 * 确定性校验：同一抽象状态重复执行迁移函数必须得到同一后继。
 */
export function verifyDeterminism(rules: BehaviorRule[], fields: string[], values: Record<string, unknown>, event: ReferenceEvent): boolean {
  const state: AbstractState = { values: { ...values }, queue: [event], guardFailures: 0, messages: 0, workflowRuns: 0, path: [], ancestors: new Set<string>() };
  const first = step(state, rules);
  const second = step(state, rules);
  return JSON.stringify(first.next?.values) === JSON.stringify(second.next?.values)
    && JSON.stringify(first.next?.queue) === JSON.stringify(second.next?.queue);
}
