import type { DesignComponent, WorkflowFile } from '../../project/types';

function replaceField(value: unknown, from: string, to: string, key = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => replaceField(item, from, to, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey === from && /map|values|defaults|parameters/i.test(key) ? to : entryKey, replaceField(entryValue, from, to, key ? `${key}.${entryKey}` : entryKey)]));
  if (typeof value === 'string' && value === from && /field|path|column|name|source|target|key|map|values|parameters/i.test(key)) return to;
  if (typeof value === 'string' && value === `$form.${from}`) return `$form.${to}`;
  if (typeof value === 'string' && value === `$${from}`) return `$${to}`;
  return value;
}

export function renameFieldReferences(components: DesignComponent[], workflows: WorkflowFile[], from: string, to: string) {
  if (!from || !to || from === to) return { components, workflows, changedComponents: 0, changedWorkflows: 0 };
  let changedComponents = 0;
  const nextComponents = components.map((component) => {
    const next = replaceField(component, from, to) as DesignComponent;
    if (JSON.stringify(next) !== JSON.stringify(component)) { changedComponents++; return next; }
    return component;
  });
  let changedWorkflows = 0;
  const nextWorkflows = workflows.map((workflow) => {
    const nodes = workflow.nodes.map((node) => {
      const raw = node.data?.propertiesJson;
      if (typeof raw !== 'string') return node;
      try { return { ...node, data: { ...node.data, propertiesJson: JSON.stringify(replaceField(JSON.parse(raw), from, to, 'properties')) } }; } catch { return node; }
    });
    if (JSON.stringify(nodes) !== JSON.stringify(workflow.nodes)) { changedWorkflows++; return { ...workflow, nodes, updatedAt: new Date().toISOString() }; }
    return workflow;
  });
  return { components: nextComponents, workflows: nextWorkflows, changedComponents, changedWorkflows };
}
