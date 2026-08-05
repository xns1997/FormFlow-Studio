import { behaviorRuleToLinkageRule, compileBehaviorDsl } from '../../../../shared/formflow-core/behaviorDsl';
import {
  createReferenceState, runReferenceSemantics,
  type ReferenceEvent, type ReferenceState,
} from '../../../../shared/formflow-core/behaviorDsl/referenceSemantics';
import { executeLinkageRules, type LinkageRuntimeContext } from './formLinkage';

/**
 * 运行时差分：把同一份 DSL 分别喂给
 * 1) 参考语义（shared/referenceSemantics.ts，文档 oracle）
 * 2) 真实表单运行时（formLinkage.executeLinkageRules）
 * 逐事件比较最终状态（字段值、组件状态、消息、流程、选项刷新、守卫失败数）。
 *
 * 用途：把 formLinkage 纳入与编译器同级的差分/模糊验证，保证运行时与文档语义一致。
 */

export interface RuntimeDifferentialEvent {
  type: 'fieldChange' | 'formLoad' | 'beforeSubmit' | 'submit' | 'buttonClick';
  field?: string;
  value?: unknown;
  buttonName?: string;
}

export interface RuntimeDifferentialResult {
  pass: boolean;
  differences: string[];
  referenceValues: Record<string, unknown>;
  linkageValues: Record<string, unknown>;
}

function eventNameOf(type: RuntimeDifferentialEvent['type']): string {
  switch (type) {
    case 'fieldChange': return 'onChange';
    case 'formLoad': return 'onLoad';
    case 'beforeSubmit': return 'onBeforeSubmit';
    case 'submit': return 'onSubmit';
    case 'buttonClick': return 'onClick';
  }
}

function referenceEvent(event: RuntimeDifferentialEvent): ReferenceEvent {
  return { type: event.type, field: event.field, value: event.value, buttonName: event.buttonName };
}

export async function runRuntimeDifferential(
  source: string,
  initialValues: Record<string, unknown>,
  events: RuntimeDifferentialEvent[],
): Promise<RuntimeDifferentialResult> {
  const { rules } = compileBehaviorDsl(source);
  const linkageRules = rules.map((rule) => behaviorRuleToLinkageRule(rule)) as unknown as Parameters<typeof executeLinkageRules>[0];
  const differences: string[] = [];
  const linkageState = {
    values: { ...initialValues },
    componentStates: {} as Record<string, Record<string, boolean | undefined>>,
    messages: [] as Array<{ level: string; message: string }>,
    workflowRuns: [] as Array<{ workflowId?: string }>,
    optionsRefreshes: [] as Array<{ targetField: string; table?: string }>,
    guardErrors: [] as string[],
  };
  let referenceState: ReferenceState = createReferenceState(initialValues);
  const guardErrorSet = new Set<string>();
  for (const event of events) {
    const reference = runReferenceSemantics(rules, referenceState.formValues, [referenceEvent(event)], {
      cascade: false,
      initialState: referenceState,
    });
    referenceState = reference.state;
    if (event.type === 'fieldChange' && event.field !== undefined) linkageState.values[event.field] = event.value;
    const ctx: LinkageRuntimeContext = {
      eventName: eventNameOf(event.type),
      field: event.field ?? '',
      value: event.value,
      values: linkageState.values,
      originalValues: {},
      getValue: (field) => linkageState.values[field],
      setValue: (field, value) => { linkageState.values[field] = value; },
      setVisible: (componentId, visible) => { linkageState.componentStates[componentId] = { ...linkageState.componentStates[componentId], visible }; },
      setDisabled: (componentId, disabled) => { linkageState.componentStates[componentId] = { ...linkageState.componentStates[componentId], disabled }; },
      setRequired: (field, required) => { linkageState.componentStates[field] = { ...linkageState.componentStates[field], required }; },
      setOptions: (field, config) => {
        linkageState.optionsRefreshes.push({ targetField: field, table: config.mode === 'table' ? config.table : undefined });
      },
      showMessage: (message, level = 'info') => { linkageState.messages.push({ level, message }); },
      runWorkflow: async (workflowId) => { linkageState.workflowRuns.push({ workflowId }); return {}; },
      runConfiguredWorkflow: async () => { linkageState.workflowRuns.push({ workflowId: undefined }); return {}; },
    };
    const result = await executeLinkageRules(linkageRules, ctx);
    for (const stage of result.stages) {
      if (stage.status === 'error') {
        linkageState.guardErrors.push(...(stage.details || []));
        for (const detail of stage.details || []) guardErrorSet.add(detail);
      }
    }
    const isGuard = event.type === 'beforeSubmit' || event.type === 'buttonClick';
    if (JSON.stringify(reference.state.formValues) !== JSON.stringify(linkageState.values)) {
      differences.push(`[${event.type}] formValues 不一致：参考=${JSON.stringify(reference.state.formValues)} 运行时=${JSON.stringify(linkageState.values)}`);
    }
    if (JSON.stringify(reference.state.componentStates) !== JSON.stringify(linkageState.componentStates)) {
      differences.push(`[${event.type}] componentStates 不一致：参考=${JSON.stringify(reference.state.componentStates)} 运行时=${JSON.stringify(linkageState.componentStates)}`);
    }
    // 守卫失败提示从消息比较中剔除（单独按错误详情精确比较）
    const referenceMessages = reference.state.messages.filter((message) => !guardErrorSet.has(message.message));
    const linkageMessages = linkageState.messages.filter((message) => !guardErrorSet.has(message.message));
    if (!isGuard && JSON.stringify(referenceMessages) !== JSON.stringify(linkageMessages)) {
      differences.push(`[${event.type}] messages 不一致：参考=${JSON.stringify(referenceMessages)} 运行时=${JSON.stringify(linkageMessages)}`);
    }
    if (JSON.stringify(reference.state.workflowRuns) !== JSON.stringify(linkageState.workflowRuns)) {
      differences.push(`[${event.type}] workflowRuns 不一致：参考=${JSON.stringify(reference.state.workflowRuns)} 运行时=${JSON.stringify(linkageState.workflowRuns)}`);
    }
    if (JSON.stringify(reference.state.optionsRefreshes) !== JSON.stringify(linkageState.optionsRefreshes)) {
      differences.push(`[${event.type}] optionsRefreshes 不一致：参考=${JSON.stringify(reference.state.optionsRefreshes)} 运行时=${JSON.stringify(linkageState.optionsRefreshes)}`);
    }
    const referenceGuards = [...reference.state.guardFailures].sort();
    const linkageGuards = [...guardErrorSet].sort();
    if (JSON.stringify(referenceGuards) !== JSON.stringify(linkageGuards)) {
      differences.push(`[${event.type}] 守卫失败不一致：参考=${JSON.stringify(referenceGuards)} 运行时=${JSON.stringify(linkageGuards)}`);
    }
  }
  return {
    pass: differences.length === 0,
    differences,
    referenceValues: referenceState.formValues,
    linkageValues: linkageState.values,
  };
}
