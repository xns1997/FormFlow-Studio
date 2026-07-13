import type { DesignComponent } from '../../project/types';

const EXPRESSION_PROP_KEYS = [
  'computedValue', 'valueExpression',
  'visibilityCondition', 'visibleExpression',
  'disabledCondition', 'disabledExpression',
  'requiredCondition', 'requiredExpression',
  'contentTemplate',
] as const;

export function extractPropertyReferences(source: string) {
  const references = new Set<string>();
  const pattern = /\bform(?:\.([A-Za-z_$\u4e00-\u9fff][\w$\u4e00-\u9fff]*)(?:\.[A-Za-z_$\u4e00-\u9fff][\w$\u4e00-\u9fff]*)*|\[['"]([^'"]+)['"]\])/g;
  for (const match of source.matchAll(pattern)) references.add(match[1] || match[2]);
  return [...references];
}

export function buildPropertyDependencyGraph(components: DesignComponent[]) {
  const graph = new Map<string, string[]>();
  for (const component of components) {
    const field = String(component.fieldBinding || component.props.name || '').trim();
    if (!field) continue;
    const source = EXPRESSION_PROP_KEYS.map((key) => String(component.props[key] || '')).join('\n');
    graph.set(field, extractPropertyReferences(source).filter((reference) => reference !== field || source.includes(`form.${field}`)));
  }
  return graph;
}

export function findPropertyDependencyCycles(graph: Map<string, string[]>) {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];
  const walk = (field: string) => {
    if (visiting.has(field)) {
      const index = stack.indexOf(field);
      const cycle = [...stack.slice(index), field];
      if (!cycles.some((current) => current.join('→') === cycle.join('→'))) cycles.push(cycle);
      return;
    }
    if (visited.has(field)) return;
    visiting.add(field); stack.push(field);
    for (const dependency of graph.get(field) || []) if (graph.has(dependency)) walk(dependency);
    stack.pop(); visiting.delete(field); visited.add(field);
  };
  for (const field of graph.keys()) walk(field);
  return cycles;
}
