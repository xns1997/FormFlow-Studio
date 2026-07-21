import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const directory = mkdtempSync(join(tmpdir(), 'formflow-tools-'));
process.env.FORMFLOW_PROJECTS_DIR = join(directory, 'projects');
process.env.FORMFLOW_DATA_DIR = join(directory, 'server-data');
process.env.FORMFLOW_DATABASE_REQUIRED = 'false';
process.env.FORMFLOW_DATABASE_AUTO_START = 'false';

const { executeFormFlowTool, listFormFlowTools, MCP_ROLES, validateMcpToolRegistry } = await import('./formflow-tool-registry');
const { projectPackagePath } = await import('./project-package-store');

const actor = { userId: 'user-1', user: { id: 'user-1', username: 'tester', role: 'user' as const } };

test.after(() => rmSync(directory, { recursive: true, force: true }));

test('tool registry exposes unique schemas and the complete lifecycle surface', () => {
  const tools = listFormFlowTools();
  assert.ok(tools.length >= 65);
  assert.equal(new Set(tools.map((item) => item.name)).size, tools.length);
  for (const name of ['project.initialize', 'project.build_from_data', 'data_source.import', 'form.generate_from_table', 'workflow_node.upsert', 'release.apply', 'project.package.export']) {
    assert.ok(tools.some((item) => item.name === name), name);
  }
  assert.ok(tools.every((item) => item.inputSchema && item.outputSchema && item.risk));
  const dataCreate = tools.find((item) => item.name === 'data_source.create')!;
  assert.deepEqual((dataCreate.inputSchema as any).properties.config.properties.keyFields.items, { type: 'string' });
  assert.ok((dataCreate.inputSchema as any).properties.config.properties.columns.items.properties.name);
  const componentUpsert = tools.find((item) => item.name === 'form_component.upsert')!;
  const propsSchema = (componentUpsert.inputSchema as any).properties.item.properties.props;
  assert.equal(propsSchema.properties.events.additionalProperties.minLength, 1);
  assert.deepEqual(propsSchema.properties.flowTriggers.additionalProperties.required, ['enabled', 'workflowId']);
});

test('data source creation accepts compatible nested config and explicit empty-table columns', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'data_schema_compat', name: '数据 Schema 兼容', idempotencyKey: 'data-schema-project' }, actor);
  assert.equal(created.ok, true, JSON.stringify(created));
  const loaded = await executeFormFlowTool('project.get', { projectId: 'data_schema_compat' }, actor);
  let revision = (loaded as any).data.revision;
  const rejected = await executeFormFlowTool('data_source.create', {
    projectId: 'data_schema_compat', id: 'bad_schema_rows', baseRevision: revision, idempotencyKey: 'data-schema-rejected',
    rows: [{ fieldId: 'device_id', title: '设备编号', type: 'string', isKey: true }],
  }, actor);
  assert.equal(rejected.ok, false); assert.equal((rejected as any).error.code, 'DATA_ROWS_LOOK_LIKE_SCHEMA');
  assert.ok((rejected as any).error.details.suggestedArguments.config.columns.length);
  const afterRejected = await executeFormFlowTool('project.get', { projectId: 'data_schema_compat' }, actor);
  assert.equal((afterRejected as any).data.revision, revision);
  const afterRejectedList = await executeFormFlowTool('data_source.list', { projectId: 'data_schema_compat' }, actor);
  assert.deepEqual((afterRejectedList as any).data, []);
  const nested = await executeFormFlowTool('data_source.create', {
    projectId: 'data_schema_compat', id: 'devices', baseRevision: revision, idempotencyKey: 'data-schema-nested',
    rows: [{ device_id: 'D-001', name: '设备一' }], config: { sheets: [{ name: 'Sheet1', config: { editable: true, keyFields: ['device_id'] } }] },
  }, actor);
  assert.equal(nested.ok, true, JSON.stringify(nested)); revision = (nested as any).meta.revision;
  assert.ok((nested as any).meta.argumentNormalizations.length);
  const empty = await executeFormFlowTool('data_source.create', {
    projectId: 'data_schema_compat', id: 'work_orders', baseRevision: revision, idempotencyKey: 'data-schema-columns',
    config: { keyFields: ['order_id'], columns: [{ name: 'order_id', type: 'string' }, { name: 'created_at', type: 'date' }] },
  }, actor);
  assert.equal(empty.ok, true, JSON.stringify(empty));
  const sheet = await executeFormFlowTool('data_sheet.get', { projectId: 'data_schema_compat', tableId: 'work_orders', sheetName: 'Sheet1' }, actor);
  assert.deepEqual((sheet as any).data.headers, ['order_id', 'created_at']);
  assert.deepEqual((sheet as any).data.config.keyFields, ['order_id']);
});

test('behavior.list declares and enforces scope-specific arguments', async () => {
  const definition = listFormFlowTools('behavior').find((item) => item.name === 'behavior.list')!;
  assert.ok(Array.isArray((definition.inputSchema as any).allOf));
  const created = await executeFormFlowTool('project.create', { id: 'behavior_list_arguments', name: '行为参数测试', idempotencyKey: 'behavior-list-create' }, actor);
  assert.equal(created.ok, true);
  const missingForm = await executeFormFlowTool('behavior.list', { projectId: 'behavior_list_arguments', scope: 'form' }, { ...actor, mcpRole: 'behavior' });
  assert.equal(missingForm.ok, false);
  assert.equal((missingForm as any).error.code, 'BEHAVIOR_FORM_REQUIRED');
  assert.equal((missingForm as any).error.path, 'formId');
  const missingSheet = await executeFormFlowTool('behavior.list', { projectId: 'behavior_list_arguments', scope: 'sheet' }, { ...actor, mcpRole: 'behavior' });
  assert.equal(missingSheet.ok, false);
  assert.equal((missingSheet as any).error.code, 'BEHAVIOR_SHEET_REQUIRED'); assert.equal((missingSheet as any).error.path, 'tableId');
});

test('behavior tools reject incomplete actions before revision changes', async () => {
  const definition = listFormFlowTools('behavior').find((item) => item.name === 'behavior.upsert')!;
  assert.deepEqual((definition.inputSchema as any).properties.scope.enum, ['global', 'sheet', 'form']);
  assert.equal((definition.inputSchema as any).properties.behavior.properties.actions.minItems, 1);
  const created = await executeFormFlowTool('project.create', { id: 'behavior_preflight', name: '行为预检', idempotencyKey: 'behavior-preflight-create' }, actor);
  assert.equal(created.ok, true);
  const loaded = await executeFormFlowTool('project.get', { projectId: 'behavior_preflight' }, actor); const revision = (loaded as any).data.revision;
  const rejected = await executeFormFlowTool('behavior.upsert', { projectId: 'behavior_preflight', scope: 'global', baseRevision: revision, idempotencyKey: 'behavior-preflight-bad', behavior: { id: 'bad', name: '空动作', trigger: { type: 'formLoad' }, conditions: [], actions: [{ type: 'setValue', targetField: '状态', expression: '' }] } }, { ...actor, mcpRole: 'behavior' });
  assert.equal(rejected.ok, false); assert.equal((rejected as any).error.code, 'BEHAVIOR_SET_VALUE_EMPTY');
  const afterRejected = await executeFormFlowTool('project.get', { projectId: 'behavior_preflight' }, actor);
  assert.equal((afterRejected as any).data.revision, revision);
  const valid = await executeFormFlowTool('behavior.upsert', { projectId: 'behavior_preflight', scope: 'global', baseRevision: revision, idempotencyKey: 'behavior-preflight-good', behavior: { id: 'welcome', name: '欢迎提示', trigger: { type: 'formLoad' }, conditions: [], actions: [{ type: 'showMessage', message: '欢迎', messageType: 'info' }] } }, { ...actor, mcpRole: 'behavior' });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  const listed = await executeFormFlowTool('behavior.list', { projectId: 'behavior_preflight', scope: 'global' }, { ...actor, mcpRole: 'behavior' });
  assert.deepEqual((listed as any).data.map((item: any) => item.id), ['welcome']);
});

test('seven MCP roles expose isolated tools and every write tool has one owner', async () => {
  const all = listFormFlowTools();
  assert.equal(validateMcpToolRegistry().tools, all.length);
  assert.equal(MCP_ROLES.length, 7);
  assert.equal(all.some((tool) => tool.name === 'project.apply_patch'), false);
  for (const role of MCP_ROLES) {
    const scoped = listFormFlowTools(role);
    assert.ok(scoped.some((tool) => tool.name === 'system.capabilities.get'), role);
    assert.ok(scoped.every((tool) => tool.ownerRole === role || (tool.risk === 'read' && tool.sharedReadRoles?.includes(role))), role);
  }
  for (const tool of all.filter((item) => item.risk !== 'read')) {
    assert.equal(MCP_ROLES.filter((role) => listFormFlowTools(role).some((item) => item.name === tool.name)).length, 1, tool.name);
    assert.equal(tool.sharedReadRoles, undefined, tool.name);
  }
  const denied = await executeFormFlowTool('form.create', {}, { ...actor, mcpRole: 'data' });
  assert.equal(denied.ok, false); assert.equal((denied as any).error.code, 'TOOL_NOT_AVAILABLE_IN_ROLE');
  const capabilities = await executeFormFlowTool('system.capabilities.get', {}, { ...actor, mcpRole: 'workflow' });
  assert.equal((capabilities as any).data.role, 'workflow');
  assert.equal((capabilities as any).data.tools, listFormFlowTools('workflow').length);
});

test('all initialization templates produce valid v2 projects', async () => {
  const catalog = await executeFormFlowTool('catalog.templates.list', {}, actor);
  assert.equal(catalog.ok, true);
  assert.deepEqual((catalog as any).data.map((item: any) => item.id), ['game_analytics', 'flexible_employment', 'china_population_forecast', 'check_valve_selection']);
  for (const templateId of ['game_analytics', 'flexible_employment', 'china_population_forecast', 'check_valve_selection']) {
    const id = `template_${templateId}`;
    const result = await executeFormFlowTool('project.initialize', { id, name: templateId, templateId, idempotencyKey: `init-${templateId}` }, actor);
    assert.equal(result.ok, true, JSON.stringify(result));
    const validation = await executeFormFlowTool('project.validate', { projectId: id }, actor);
    assert.equal(validation.ok, true); assert.equal((validation as any).data.valid, true, JSON.stringify(validation));
  }
  const legacy = await executeFormFlowTool('project.initialize', { id: 'template_legacy', name: 'legacy', templateId: 'blank_form', idempotencyKey: 'init-legacy' }, actor);
  assert.equal(legacy.ok, true, JSON.stringify(legacy));
  const legacyProject = await executeFormFlowTool('project.inspect', { projectId: 'template_legacy' }, actor);
  assert.ok((legacyProject as any).data.forms.some((item: any) => item.id === 'game_event_entry'));
});

test('project, data, form and row tools form a revision-protected lifecycle', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'tool_demo', name: '工具测试', idempotencyKey: 'create-1' }, actor);
  assert.equal(created.ok, true);
  const loaded = await executeFormFlowTool('project.get', { projectId: 'tool_demo' }, actor);
  assert.equal(loaded.ok, true);
  let revision = (loaded as any).data.revision;

  const rows = Array.from({ length: 150 }, (_, index) => ({ id: `R-${index + 1}`, name: `记录 ${index + 1}`, amount: index }));
  const imported = await executeFormFlowTool('data_source.import', { projectId: 'tool_demo', id: 'records', rows, config: { keyFields: ['id'] }, baseRevision: revision, idempotencyKey: 'import-1' }, actor);
  assert.equal(imported.ok, true, JSON.stringify(imported)); revision = (imported as any).meta.revision;

  const queried = await executeFormFlowTool('data_rows.query', { projectId: 'tool_demo', tableId: 'records', sheetName: 'Sheet1', page: 2, pageSize: 100 }, actor);
  assert.equal(queried.ok, true); assert.equal((queried as any).data.total, 150); assert.equal((queried as any).data.rows.length, 50);

  const generated = await executeFormFlowTool('form.generate_from_table', { projectId: 'tool_demo', tableId: 'records', sheetName: 'Sheet1', id: 'record_edit', mode: 'edit', baseRevision: revision, idempotencyKey: 'form-1' }, actor);
  assert.equal(generated.ok, true, JSON.stringify(generated)); revision = (generated as any).meta.revision;

  const conflict = await executeFormFlowTool('form.create', { projectId: 'tool_demo', id: 'late_form', name: '冲突', baseRevision: 'stale', idempotencyKey: 'conflict-1' }, actor);
  assert.equal(conflict.ok, false); assert.equal((conflict as any).error.code, 'PROJECT_REVISION_CONFLICT');

  const batch = await executeFormFlowTool('data_rows.batch', { projectId: 'tool_demo', tableId: 'records', sheetName: 'Sheet1', baseRevision: revision, baseVersion: (queried as any).data.dataVersion, updates: [{ rowKey: 'key:R-1', changes: { amount: 999 } }], idempotencyKey: 'batch-1' }, actor);
  assert.equal(batch.ok, true, JSON.stringify(batch));
  const raw = JSON.parse(readFileSync(join(projectPackagePath('tool_demo'), 'data', 'records.json'), 'utf8'));
  assert.equal(raw[0].amount, 999);
});

test('form designs without timestamps produce stable revisions and are normalized on write', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'stable_form_revision', name: '稳定表单版本', idempotencyKey: 'stable-create' }, actor);
  assert.equal(created.ok, true);
  const initial = await executeFormFlowTool('project.get', { projectId: 'stable_form_revision' }, actor);
  const firstRevision = (initial as any).data.revision;
  const first = await executeFormFlowTool('form.create', {
    projectId: 'stable_form_revision', id: 'form-one', name: '表单一', baseRevision: firstRevision, idempotencyKey: 'stable-form-one',
    design: { id: 'form-one-design', name: '表单一', formMode: 'create', components: [], bindings: [] },
  }, actor);
  assert.equal(first.ok, true, JSON.stringify(first));
  const loadedA = await executeFormFlowTool('project.get', { projectId: 'stable_form_revision' }, actor);
  const loadedB = await executeFormFlowTool('project.get', { projectId: 'stable_form_revision' }, actor);
  assert.equal((loadedA as any).data.revision, (loadedB as any).data.revision);
  assert.ok((loadedA as any).data.project.forms[0].design.createdAt);
  assert.ok((loadedA as any).data.project.forms[0].design.updatedAt);
  const second = await executeFormFlowTool('form.create', {
    projectId: 'stable_form_revision', id: 'form-two', name: '表单二', baseRevision: (loadedA as any).data.revision, idempotencyKey: 'stable-form-two',
    design: { id: 'form-two-design', name: '表单二', formMode: 'edit', components: [], bindings: [] },
  }, actor);
  assert.equal(second.ok, true, JSON.stringify(second));
});

test('form tools normalize missing geometry and partial component updates preserve layout', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'form_geometry_guard', name: '布局保护', idempotencyKey: 'geometry-create' }, actor);
  assert.equal(created.ok, true); const initial = await executeFormFlowTool('project.get', { projectId: 'form_geometry_guard' }, actor);
  const form = await executeFormFlowTool('form.create', { projectId: 'form_geometry_guard', id: 'request', name: '申请', baseRevision: (initial as any).data.revision, idempotencyKey: 'geometry-form', design: { id: 'request-design', name: '申请', components: [{ id: 'submit', type: 'button', props: { label: '提交' } }], bindings: [] } }, { ...actor, mcpRole: 'form' });
  assert.equal(form.ok, true, JSON.stringify(form));
  let loaded = await executeFormFlowTool('form.get', { projectId: 'form_geometry_guard', id: 'request' }, actor);
  const before = (loaded as any).data.design.components[0];
  assert.ok(Number.isFinite(before.x) && Number.isFinite(before.y)); assert.ok(before.width > 0 && before.height > 0);
  const project = await executeFormFlowTool('project.get', { projectId: 'form_geometry_guard' }, actor);
  const updated = await executeFormFlowTool('form_component.upsert', { projectId: 'form_geometry_guard', formId: 'request', item: { id: 'submit', props: { events: { onClick: 'return true;' } } }, baseRevision: (project as any).data.revision, idempotencyKey: 'geometry-partial-update' }, { ...actor, mcpRole: 'form' });
  assert.equal(updated.ok, true, JSON.stringify(updated));
  loaded = await executeFormFlowTool('form.get', { projectId: 'form_geometry_guard', id: 'request' }, actor);
  const after = (loaded as any).data.design.components[0];
  assert.deepEqual({ x: after.x, y: after.y, width: after.width, height: after.height, type: after.type, label: after.props.label }, { x: before.x, y: before.y, width: before.width, height: before.height, type: 'button', label: '提交' });
  assert.equal(after.props.events.onClick, 'return true;');
  const validation = await executeFormFlowTool('project.validate', { projectId: 'form_geometry_guard' }, actor);
  assert.equal(validation.ok, true, JSON.stringify(validation));
  assert.equal((validation as any).data.structural.valid, true, JSON.stringify(validation));
  assert.equal((validation as any).data.references.valid, true, JSON.stringify(validation));
  assert.equal((validation as any).data.semantic.valid, false, JSON.stringify(validation));
  assert.ok((validation as any).data.semantic.errors.some((issue: any) => issue.code === 'BUTTON_WITHOUT_BUSINESS_EFFECT'), JSON.stringify(validation));
});

test('form geometry normalization repairs clipped single-line fields', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'field_height_guard', name: '字段高度保护', idempotencyKey: 'field-height-create' }, actor);
  assert.equal(created.ok, true);
  const initial = await executeFormFlowTool('project.get', { projectId: 'field_height_guard' }, actor);
  const form = await executeFormFlowTool('form.create', {
    projectId: 'field_height_guard', id: 'inspection', name: '巡检', baseRevision: (initial as any).data.revision, idempotencyKey: 'field-height-form',
    design: { id: 'inspection-design', name: '巡检', components: [{ id: 'inspection-date', type: 'datePicker', width: 300, height: 68, props: { label: '最近巡检日期' } }], bindings: [] },
  }, { ...actor, mcpRole: 'form' });
  assert.equal(form.ok, true, JSON.stringify(form));
  const loaded = await executeFormFlowTool('form.get', { projectId: 'field_height_guard', id: 'inspection' }, actor);
  assert.equal((loaded as any).data.design.components[0].height, 76);
});

test('workflow writes normalize model-friendly nodes and endpoint objects and reject empty flows', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'workflow_normalization', name: '流程归一化', idempotencyKey: 'workflow-normalization-create' }, actor);
  assert.equal(created.ok, true);
  let loaded = await executeFormFlowTool('project.get', { projectId: 'workflow_normalization' }, actor);
  const normalized = await executeFormFlowTool('workflow.create', {
    projectId: 'workflow_normalization', id: 'calculation', baseRevision: (loaded as any).data.revision, idempotencyKey: 'workflow-normalized-create',
    item: {
      name: '计算流程',
      nodes: [
        { id: 'first', type: 'behavior-calculate', label: '计算一', x: 10, y: 20, config: { operator: 'add' } },
        { id: 'second', type: 'behavior-calculate', label: '计算二', x: 200, y: 20, props: { operator: 'multiply' } },
      ],
      edges: [{ id: 'result-to-a', source: { nodeId: 'first', portId: 'result' }, target: { nodeId: 'second', portId: 'a' } }],
    },
  }, actor);
  assert.equal(normalized.ok, true, JSON.stringify(normalized));
  const flow = await executeFormFlowTool('workflow.get', { projectId: 'workflow_normalization', id: 'calculation' }, actor);
  assert.equal((flow as any).data.nodes[0].specId, 'behavior-calculate');
  assert.deepEqual((flow as any).data.nodes[0].position, { x: 10, y: 20 });
  assert.equal((flow as any).data.edges[0].source, 'first');
  assert.equal((flow as any).data.edges[0].sourceHandle, 'out:result');
  assert.equal((flow as any).data.edges[0].targetHandle, 'in:a');

  loaded = await executeFormFlowTool('project.get', { projectId: 'workflow_normalization' }, actor);
  const empty = await executeFormFlowTool('workflow.create', {
    projectId: 'workflow_normalization', item: { id: 'empty', name: '空流程', nodes: [], edges: [] },
    baseRevision: (loaded as any).data.revision, idempotencyKey: 'workflow-empty-create',
  }, actor);
  assert.equal(empty.ok, false); assert.equal((empty as any).error.code, 'PROJECT_VALIDATION_FAILED');
  assert.equal((empty as any).error.path, 'workflows.empty.nodes');
});

test('quality inspection rejects a form that only contains an empty root container', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'empty_form_quality', name: '空表单质量门禁', idempotencyKey: 'empty-form-project' }, actor);
  assert.equal(created.ok, true);
  const loaded = await executeFormFlowTool('project.get', { projectId: 'empty_form_quality' }, actor);
  const form = await executeFormFlowTool('form.create', { projectId: 'empty_form_quality', id: 'empty', name: '空表单', baseRevision: (loaded as any).data.revision, idempotencyKey: 'empty-form-create' }, actor);
  assert.equal(form.ok, true, JSON.stringify(form));
  const quality = await executeFormFlowTool('project.quality.inspect', { projectId: 'empty_form_quality' }, actor);
  assert.equal(quality.ok, true);
  assert.equal((quality as any).data.ready, false);
  assert.ok((quality as any).data.diagnostics.some((item: any) => item.code === 'EMPTY_FORM'));
});

test('quality inspection verifies declared computed-field formulas against preview rows', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'computed_quality', name: '计算字段质量', idempotencyKey: 'computed-quality-create' }, actor);
  assert.equal(created.ok, true);
  let loaded = await executeFormFlowTool('project.get', { projectId: 'computed_quality' }, actor);
  const source = await executeFormFlowTool('data_source.import', { projectId: 'computed_quality', id: 'orders', rows: [{ id: '1', quantity: 2, price: 5, total: 9 }], config: { keyFields: ['id'] }, baseRevision: (loaded as any).data.revision, idempotencyKey: 'computed-quality-data' }, actor);
  assert.equal(source.ok, true, JSON.stringify(source));
  const configured = await executeFormFlowTool('data_sheet.configure', { projectId: 'computed_quality', tableId: 'orders', sheetName: 'Sheet1', config: { computedFields: [{ target: 'total', expression: '$quantity * $price', tolerance: 0.001 }] }, baseRevision: (source as any).meta.revision, idempotencyKey: 'computed-quality-config' }, actor);
  assert.equal(configured.ok, true, JSON.stringify(configured));
  const quality = await executeFormFlowTool('project.quality.inspect', { projectId: 'computed_quality' }, actor);
  assert.ok((quality as any).data.diagnostics.some((item: any) => item.code === 'COMPUTED_FIELD_MISMATCH'));
});

test('project metadata and release drafts are edited by separate MCP owners', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'release_demo', name: '发布边界', idempotencyKey: 'release-create' }, { ...actor, mcpRole: 'project' });
  assert.equal(created.ok, true);
  const loaded = await executeFormFlowTool('project.get', { projectId: 'release_demo' }, { ...actor, mcpRole: 'project' }); const revision = (loaded as any).data.revision;
  const rejected = await executeFormFlowTool('project.update', { projectId: 'release_demo', release: { defaultFormId: 'x' }, baseRevision: revision, idempotencyKey: 'wrong-owner' }, { ...actor, mcpRole: 'project' });
  assert.equal(rejected.ok, false); assert.equal((rejected as any).error.code, 'INVALID_ARGUMENT');
  const updated = await executeFormFlowTool('release.update', { projectId: 'release_demo', patch: { allowDesigner: false }, baseRevision: revision, idempotencyKey: 'release-update' }, { ...actor, mcpRole: 'delivery' });
  assert.equal(updated.ok, true, JSON.stringify(updated));
  const modeRejected = await executeFormFlowTool('release.update', { projectId: 'release_demo', patch: { mode: 'use' }, baseRevision: (updated as any).meta.revision, idempotencyKey: 'release-mode' }, { ...actor, mcpRole: 'delivery' });
  assert.equal(modeRejected.ok, false); assert.equal((modeRejected as any).error.code, 'INVALID_ARGUMENT');
});

test('behavior MCP owns linted rule-code writes and form MCP cannot bypass that boundary', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'rule_owner_demo', name: '规则归属', idempotencyKey: 'rule-owner-create' }, actor);
  assert.equal(created.ok, true);
  let loaded = await executeFormFlowTool('project.get', { projectId: 'rule_owner_demo' }, actor);
  const form = await executeFormFlowTool('form.create', { projectId: 'rule_owner_demo', id: 'calculator', name: '计算表单', baseRevision: (loaded as any).data.revision, idempotencyKey: 'rule-owner-form', design: { id: 'calculator-design', name: '计算表单', formMode: 'edit', bindings: [], components: [{ id: 'root', type: 'form', children: ['quantity', 'price', 'total'], props: {} }, { id: 'quantity', type: 'number', fieldBinding: 'quantity', props: { name: 'quantity' } }, { id: 'price', type: 'number', fieldBinding: 'price', props: { name: 'price' } }, { id: 'total', type: 'number', fieldBinding: 'total', props: { name: 'total' } }] } }, actor);
  assert.equal(form.ok, true, JSON.stringify(form));
  loaded = await executeFormFlowTool('project.get', { projectId: 'rule_owner_demo' }, actor);
  const bypass = await executeFormFlowTool('form.update', { projectId: 'rule_owner_demo', id: 'calculator', patch: { ruleCode: 'compute $total = $quantity * $price watch($quantity, $price)' }, baseRevision: (loaded as any).data.revision, idempotencyKey: 'rule-owner-bypass' }, { ...actor, mcpRole: 'form' });
  assert.equal(bypass.ok, false); assert.equal((bypass as any).error.code, 'INVALID_ARGUMENT');
  const invalid = await executeFormFlowTool('rule_code.update', { projectId: 'rule_owner_demo', formId: 'calculator', code: 'not valid', baseRevision: (loaded as any).data.revision, idempotencyKey: 'rule-owner-invalid' }, { ...actor, mcpRole: 'behavior' });
  assert.equal(invalid.ok, false); assert.equal((invalid as any).error.code, 'RULE_SYNTAX_INVALID');
  const valid = await executeFormFlowTool('rule_code.update', { projectId: 'rule_owner_demo', formId: 'calculator', code: 'compute $total = $quantity * $price watch($quantity, $price)', baseRevision: (loaded as any).data.revision, idempotencyKey: 'rule-owner-valid' }, { ...actor, mcpRole: 'behavior' });
  assert.equal(valid.ok, true, JSON.stringify(valid));
  const updated = await executeFormFlowTool('form.get', { projectId: 'rule_owner_demo', id: 'calculator' }, actor);
  assert.match((updated as any).data.ruleCode, /compute \$total/);
  assert.ok((updated as any).data.design.components.find((item: any) => item.id === 'quantity').props.linkageRules.onChange.length > 0);
});

test('destructive tools require a bound single-use confirmation token', async () => {
  const loaded = await executeFormFlowTool('project.get', { projectId: 'tool_demo' }, actor); const revision = (loaded as any).data.revision;
  const first = await executeFormFlowTool('form.delete', { projectId: 'tool_demo', id: 'record_edit', baseRevision: revision, idempotencyKey: 'delete-form-1', cascade: true }, actor);
  assert.equal(first.ok, false); assert.equal((first as any).status, 'confirmation_required');
  const confirmed = await executeFormFlowTool('form.delete', { projectId: 'tool_demo', id: 'record_edit', baseRevision: revision, idempotencyKey: 'delete-form-1', cascade: true, confirmationToken: (first as any).confirmation.token }, actor);
  assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
  const replay = await executeFormFlowTool('form.delete', { projectId: 'tool_demo', id: 'record_edit', baseRevision: revision, idempotencyKey: 'delete-form-replay', cascade: true, confirmationToken: (first as any).confirmation.token }, actor);
  assert.equal(replay.ok, false); assert.equal((replay as any).status, 'confirmation_required');
});

test('deterministic .formflow export can be imported and unpacked through an uploaded fileId', async () => {
  const exported = await executeFormFlowTool('project.package.export', { projectId: 'tool_demo' }, actor);
  assert.equal(exported.ok, true);
  const files = join(directory, 'server-data', 'files'); mkdirSync(files, { recursive: true });
  assert.equal((exported as any).data.fileName, 'tool_demo.formflow');
  const storedName = 'tool-demo.formflow'; const content = Buffer.from((exported as any).data.content, 'base64');
  writeFileSync(join(files, storedName), content);
  writeFileSync(join(files, 'file_package.meta.json'), JSON.stringify({ id: 'file_package', storedName, originalName: storedName, fileType: 'formflow', size: content.length }));
  const imported = await executeFormFlowTool('project.import', { fileId: 'file_package', projectId: 'tool_imported', idempotencyKey: 'package-import-1' }, actor);
  assert.equal(imported.ok, true, JSON.stringify(imported));
  const validation = await executeFormFlowTool('project.package.validate', { projectId: 'tool_imported' }, actor);
  assert.equal(validation.ok, true); assert.equal((validation as any).data.valid, true);
});

test('mock data and persisted project tests are deterministic and append-only', async () => {
  const created = await executeFormFlowTool('project.create', { id: 'mock_demo', name: 'Mock 测试', idempotencyKey: 'mock-create' }, actor);
  assert.equal(created.ok, true);
  let loaded = await executeFormFlowTool('project.get', { projectId: 'mock_demo' }, actor); let revision = (loaded as any).data.revision;
  const imported = await executeFormFlowTool('data_source.import', { projectId: 'mock_demo', id: 'employees', rows: [{ 工号: 'E-00000', 姓名: '已有员工', 部门: '技术部' }], config: { keyFields: ['工号'] }, baseRevision: revision, idempotencyKey: 'mock-import' }, actor);
  assert.equal(imported.ok, true, JSON.stringify(imported)); revision = (imported as any).meta.revision;
  const previewA = await executeFormFlowTool('mock_data.preview', { projectId: 'mock_demo', tableId: 'employees', sheetName: 'Sheet1', rowCount: 3, seed: 42 }, actor);
  const previewB = await executeFormFlowTool('mock_data.preview', { projectId: 'mock_demo', tableId: 'employees', sheetName: 'Sheet1', rowCount: 3, seed: 42 }, actor);
  assert.deepEqual((previewA as any).data.rows, (previewB as any).data.rows);
  assert.ok((previewA as any).data.isolatedCases.some((item: any) => item.scenario === 'duplicate_key'));
  const applied = await executeFormFlowTool('mock_data.apply', { projectId: 'mock_demo', tableId: 'employees', sheetName: 'Sheet1', rowCount: 3, seed: 42, baseRevision: revision, idempotencyKey: 'mock-apply' }, actor);
  assert.equal(applied.ok, true, JSON.stringify(applied)); revision = (applied as any).meta.revision;
  const rows = await executeFormFlowTool('data_rows.query', { projectId: 'mock_demo', tableId: 'employees', sheetName: 'Sheet1' }, actor);
  assert.equal((rows as any).data.total, 4); assert.equal((rows as any).data.rows[0].姓名, '已有员工');
  const form = await executeFormFlowTool('form.generate_from_table', { projectId: 'mock_demo', tableId: 'employees', sheetName: 'Sheet1', id: 'employee_edit', mode: 'edit', baseRevision: revision, idempotencyKey: 'mock-form' }, actor);
  assert.equal(form.ok, true, JSON.stringify(form)); revision = (form as any).meta.revision;
  const suite = await executeFormFlowTool('project_test.generate', { projectId: 'mock_demo', seed: 42, baseRevision: revision, idempotencyKey: 'test-generate' }, actor);
  assert.equal(suite.ok, true); revision = (suite as any).meta.revision;
  const run = await executeFormFlowTool('project_test.run', { projectId: 'mock_demo', suiteId: (suite as any).data.id, baseRevision: revision, idempotencyKey: 'test-run' }, actor);
  assert.equal(run.ok, true, JSON.stringify(run)); assert.equal((run as any).data.passed, true);
  const history = await executeFormFlowTool('project_test.history', { projectId: 'mock_demo' }, actor);
  assert.equal((history as any).data.fixtures.length, 1); assert.equal((history as any).data.runs.length, 1);
  assert.ok(existsSync(join(projectPackagePath('mock_demo'), 'testing', 'testing.json')));
});
