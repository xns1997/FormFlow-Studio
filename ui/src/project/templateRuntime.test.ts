import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectTemplate, type ProjectTemplateId } from '../../../shared/project-templates';
import { exportToComponentNodes } from '../designer/export';
import { executeFormControlEvent } from '../services/engine/formEventExecutor';
import { collectFlowSideEffects } from '../services/engine/flowSideEffects';
import { applyPreviewFlowSideEffects } from '../services/io/projectWriteBack';
import type { ProjectStructure } from './types';

const templateIds: ProjectTemplateId[] = ['game_analytics', 'flexible_employment', 'china_population_forecast', 'check_valve_selection'];

function project(templateId: ProjectTemplateId) {
  return buildProjectTemplate(templateId, { id: `runtime_${templateId}`, name: templateId, now: '2026-07-16T00:00:00.000Z' }) as ProjectStructure;
}

async function click(source: ProjectStructure, formId: string, componentId: string, values: Record<string, unknown>) {
  const form = source.forms.find((item) => item.id === formId)!;
  const components = exportToComponentNodes(form.design.components);
  const component = components.find((item) => item.id === componentId)!;
  const result = await executeFormControlEvent({ eventName: 'onClick', field: component.name, values, originalValues: {}, component }, {
    workflows: source.workflows, tables: source.srcTable, components,
    setValue: () => {}, setVisible: () => {}, setDisabled: () => {}, setRequired: () => {}, showMessage: () => {},
    trigger: component.props.flowTriggers?.onClick,
  });
  const effects = result.flowResults.flatMap((item) => collectFlowSideEffects(item));
  return { result, project: applyPreviewFlowSideEffects(source, effects).project };
}

for (const templateId of templateIds) {
  test(`${templateId} saves a new keyed record and runs productized analysis`, async () => {
    const source = project(templateId);
    const entry = source.forms.find((item) => item.design.formMode === 'create')!;
    const fields = entry.design.components.filter((item) => item.fieldBinding);
    const values = Object.fromEntries(fields.map((item, index) => {
      const firstOption = item.props?.options?.[0]?.value;
      return [item.fieldBinding!, item.props?.required ? (item.type === 'number' ? index + 10 : firstOption ?? `AUTO-${templateId}-${index}`) : item.type === 'number' ? index + 1 : firstOption ?? `值${index}`];
    }));
    const keyField = source.srcTable.find((item) => item.sheets[0].name === source.release?.defaultSheet)?.sheets[0].config?.keyFields[0]!;
    values[keyField] = `NEW-${templateId}`;
    const saved = await click(source, entry.id, 'entry_save', values);
    assert.equal(saved.result.flowExecuted, true);
    const target = saved.project.srcTable.find((item) => item.sheets[0].name === source.release?.defaultSheet)!;
    assert.equal(target.sheets[0].preview.some((row) => row[keyField] === `NEW-${templateId}`), true);

    const dashboard = source.forms.find((item) => item.design.formMode === 'detail')!;
    const analyzed = await click(source, dashboard.id, 'dashboard_analyze', { trigger: true });
    assert.equal(analyzed.result.flowExecuted, true);
    assert.equal(analyzed.result.flowResults[0]?.error, undefined);
  });
}

test('legacy template ids resolve only to the new industry implementation', () => {
  const source = buildProjectTemplate('blank_form', { id: 'legacy', name: 'legacy', now: '2026-07-16T00:00:00.000Z' }) as ProjectStructure;
  assert.ok(source.forms.some((item) => item.id === 'game_event_entry'));
  assert.deepEqual(source.forms.map((item) => item.id).sort(), ['game_analytics_dashboard', 'game_event_entry']);
});
