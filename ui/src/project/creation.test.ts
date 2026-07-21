import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROJECT_TEMPLATES,
  createBlankProject,
  createProjectFromTemplate,
  parseTagInput,
} from './creation';

test('blank project creation generates a new id and applies meta fields', () => {
  const project = createBlankProject({
    name: '客户台账',
    description: '客户跟踪项目',
    author: 'Alice',
    tags: ['销售', '录入'],
  });
  assert.match(project.config.id, /^proj_/);
  assert.equal(project.config.name, '客户台账');
  assert.equal(project.config.description, '客户跟踪项目');
  assert.equal(project.config.author, 'Alice');
  assert.deepEqual(project.config.tags, ['销售', '录入']);
});

test('tag parsing keeps stable trimmed tags', () => {
  assert.deepEqual(parseTagInput(' 销售, 审批, , 报表 '), ['销售', '审批', '报表']);
});

test('template creation keeps industry skeleton and rewrites meta', () => {
  const project = createProjectFromTemplate('flexible_employment', {
    name: '就业观察',
    description: '灵活就业模板',
    author: 'Bob',
    tags: ['审批'],
  });
  assert.equal(project.config.name, '就业观察');
  assert.equal(project.config.author, 'Bob');
  assert.equal(project.workflows.length, 2);
  assert.equal(project.forms.length, 2);
  assert.equal(project.srcTable.find((item) => item.id === 'work_records')?.sheets[0]?.config?.keyFields[0], '工作记录ID');
});

test('all built-in templates produce valid project structures', () => {
  assert.deepEqual(PROJECT_TEMPLATES.map((item) => item.id), ['game_analytics', 'flexible_employment', 'china_population_forecast', 'check_valve_selection']);
  for (const template of PROJECT_TEMPLATES) {
    const project = createProjectFromTemplate(template.id, {
      name: template.name,
      description: template.description,
      author: 'system',
      tags: [template.kind],
    });
    assert.match(project.config.id, /^proj_/);
    assert.ok(project.forms.length >= 1);
    assert.ok(project.forms.some((form) => form.design.components.some((item) => item.type === 'chart')));
    assert.ok(project.forms.some((form) => form.design.components.some((item) => item.type === 'table')));
    assert.equal(project.workflows.flatMap((flow) => flow.nodes).some((item) => ['behavior-js-script', 'generic-custom-js'].includes(item.specId || '')), false);
    const workflowIds = new Set(project.workflows.map((item) => item.id));
    for (const form of project.forms) for (const component of form.design.components) {
      if (component.type !== 'button') continue;
      const triggers = Object.values(component.props.flowTriggers || {});
      assert.equal(Boolean(component.props.events), false, `${template.id}/${component.id} contains inline script`);
      assert.ok(triggers.length > 0, `${template.id}/${component.id} has no workflow`);
      for (const trigger of triggers) if (trigger?.enabled) assert.ok(workflowIds.has(trigger.workflowId), `${template.id}/${component.id} has a missing workflow`);
    }
    for (const source of project.srcTable) for (const sheet of source.sheets) {
      if (sheet.config?.readOnly) continue;
      const keys = sheet.config?.keyFields || [];
      assert.ok(keys.length > 0, `${template.id}/${source.id} has no key`);
      assert.equal(new Set(sheet.preview.map((row) => JSON.stringify(keys.map((key) => row[key])))).size, sheet.preview.length);
    }
  }
});
