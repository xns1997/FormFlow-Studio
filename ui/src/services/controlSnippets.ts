import type { DesignComponent } from '../project/types';

export interface ControlSnippetExample {
  id: string;
  title: string;
  summary: string;
  code: string;
}

function resolveControlName(component: Pick<DesignComponent, 'id' | 'fieldBinding' | 'props'>) {
  return String(component.fieldBinding || component.props.name || component.id || '').trim();
}

function uniqueControls(components: DesignComponent[]) {
  const entries = components
    .map((component) => ({ component, name: resolveControlName(component) }))
    .filter((entry) => entry.name);
  return [...new Map(entries.map((entry) => [entry.name, entry.component])).values()];
}

function pickControl(components: DesignComponent[], matcher: (component: DesignComponent, name: string) => boolean) {
  return uniqueControls(components).find((component) => matcher(component, resolveControlName(component)));
}

export function getControlSnippetExamples(options: {
  components?: DesignComponent[];
  currentField?: string;
  eventName?: string;
}): ControlSnippetExample[] {
  const components = options.components || [];
  const namedControls = uniqueControls(components);
  const currentField = String(options.currentField || resolveControlName(namedControls[0] || { id: '', fieldBinding: '', props: {} }) || 'field').trim() || 'field';
  const currentHandle = `ctx.controls.${currentField}`;
  const firstPeer = namedControls.find((component) => resolveControlName(component) !== currentField);
  const messageTarget = pickControl(components, (component, name) =>
    name !== currentField && (/(summary|result|status|hint|preview|message|note)/i.test(name) || component.type === 'text'));
  const buttonTarget = pickControl(components, (component, name) =>
    name !== currentField && (component.type === 'button' || /(submit|save|approve|button)/i.test(name)));
  const visibleTarget = pickControl(components, (component, name) =>
    name !== currentField && (component.type === 'table' || component.type === 'text' || /(table|result|detail|panel|section|preview)/i.test(name)));
  const tableTarget = pickControl(components, (component, name) =>
    name !== currentField && (component.type === 'table' || /(table|result|rows|list)/i.test(name)));
  const writeTarget = resolveControlName(messageTarget || firstPeer || { id: currentField, fieldBinding: currentField, props: {} });
  const visibleName = resolveControlName(visibleTarget || firstPeer || { id: currentField, fieldBinding: currentField, props: {} });
  const buttonName = resolveControlName(buttonTarget || firstPeer || { id: currentField, fieldBinding: currentField, props: {} });
  const tableName = resolveControlName(tableTarget || visibleTarget || firstPeer || { id: currentField, fieldBinding: currentField, props: {} });
  const examples: ControlSnippetExample[] = [
    {
      id: 'read-current-control',
      title: '读取当前控件句柄',
      summary: '直接从 ctx.controls 读取当前控件值，适合代替手写字段查找。',
      code: `const current = ${currentHandle}.value;\nctx.console.log('${currentField} 当前值：', current);`,
    },
  ];

  if (writeTarget && writeTarget !== currentField) {
    examples.push({
      id: 'write-peer-control',
      title: '写入相邻控件',
      summary: `把 ${currentField} 的值直接写到 ${writeTarget}，适合同表单内轻量联动。`,
      code: `const value = String(${currentHandle}.value || '').trim();\nctx.controls.${writeTarget}.value = value;`,
    });
  }

  if (buttonName && buttonName !== currentField) {
    examples.push({
      id: 'toggle-button-disabled',
      title: '按输入启用按钮',
      summary: `根据 ${currentField} 是否为空，直接切换 ${buttonName} 的禁用状态。`,
      code: `const ready = String(${currentHandle}.value || '').trim().length > 0;\nctx.controls.${buttonName}.disabled = !ready;`,
    });
  }

  if (visibleName && visibleName !== currentField) {
    examples.push({
      id: 'toggle-target-visible',
      title: '切换目标控件显隐',
      summary: `根据 ${currentField} 是否有值，直接显示或隐藏 ${visibleName}。`,
      code: `ctx.controls.${visibleName}.visible = Boolean(${currentHandle}.value);`,
    });
  }

  if (tableName && tableName !== currentField && /click|submit/i.test(String(options.eventName || ''))) {
    examples.push({
      id: 'write-workflow-result',
      title: '把流程结果写到表格',
      summary: `按钮类事件里执行流程后，直接把结果回填到 ${tableName}。`,
      code: `const result = await ctx.runConfiguredWorkflow();\nconst rows = result.nodeResults.get('filter')?.outputs.result || [];\nctx.controls.${tableName}.value = rows;`,
    });
  }

  return examples.slice(0, 5);
}
