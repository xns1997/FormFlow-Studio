import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readProjectPackage } from '../../../server/src/services/project-package-store';
import { exportToComponentNodes } from '../designer/export';
import { importFromZip } from '../project/packageManager';
import type { ProjectStructure } from '../project/types';
import { executeFormFlowTrigger, type FormFlowTriggerConfig } from './formFlowTrigger';
import { executeFormControlEvent } from './formEventExecutor';

const repositoryRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

function loadSupportOps(): ProjectStructure {
  const project = readProjectPackage('example_support_ops');
  assert.ok(project);
  return project as ProjectStructure;
}

test('support ops example includes release metadata and sheet behaviors required by the规范流程', () => {
  const project = loadSupportOps();
  assert.equal(project.release?.mode, 'use');
  assert.equal(project.release?.defaultFormId, 'form_ticket_create');
  assert.equal(project.release?.allowDesigner, false);
  assert.equal(project.forms.length, 2);
  assert.equal(project.sheetBehaviors?.length, 2);
  assert.equal(project.sheetBehaviors?.find((entry) => entry.tableId === 'service_tickets')?.behaviors.length, 2);
});

test('support ops filter workflow returns only the requested status rows', async () => {
  const project = loadSupportOps();
  const searchButton = exportToComponentNodes(project.forms[1].design.components).find((component) => component.id === 'dispatch_search');
  assert.ok(searchButton);
  const config = (searchButton.props.flowTriggers as Record<string, FormFlowTriggerConfig>).onClick;
  const workflow = project.workflows.find((item) => item.id === config.workflowId);
  assert.ok(workflow);

  const result = await executeFormFlowTrigger(workflow, config, {
    eventName: 'onClick',
    field: searchButton.name,
    value: undefined,
    values: { 筛选状态: '待分派' },
    originalValues: {},
    component: searchButton,
  }, project.srcTable);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('filter')?.outputs.result, [
    { 工单ID: 1001, 客户名称: '华星零售', 问题类型: '账号开通', 优先级: '中', 状态: '待分派', 处理人: '李青', 创建日期: '2026-07-01', 处理说明: '' },
    { 工单ID: 1003, 客户名称: '海辰制造', 问题类型: '数据修正', 优先级: '高', 状态: '待分派', 处理人: '赵宁', 创建日期: '2026-07-03', 处理说明: '' },
  ]);
});

test('support ops create workflow produces an upsert write-back for a new ticket', async () => {
  const project = loadSupportOps();
  const createButton = exportToComponentNodes(project.forms[0].design.components).find((component) => component.id === 'create_submit');
  assert.ok(createButton);
  const config = (createButton.props.flowTriggers as Record<string, FormFlowTriggerConfig>).onClick;
  const workflow = project.workflows.find((item) => item.id === config.workflowId);
  assert.ok(workflow);

  const result = await executeFormFlowTrigger(workflow, config, {
    eventName: 'onClick',
    field: createButton.name,
    value: undefined,
    values: {
      工单ID: 1005,
      客户名称: '北海新能源',
      问题类型: '账号开通',
      优先级: '中',
      状态: '待分派',
      处理人: '李青',
      创建日期: '2026-07-06',
      处理说明: '需要为新门店开通后台账号',
    },
    originalValues: {},
    component: createButton,
  }, project.srcTable);
  assert.equal(result.success, true, result.errors.join('\n'));
  assert.deepEqual(result.nodeResults.get('submit')?.outputs.writeBack, {
    kind: 'upsert-table-row',
    tableId: 'service_tickets',
    sheetName: '服务工单',
    keyField: '工单ID',
    keyValue: 1005,
    row: {
      工单ID: 1005,
      客户名称: '北海新能源',
      问题类型: '账号开通',
      优先级: '中',
      状态: '待分派',
      处理人: '李青',
      创建日期: '2026-07-06',
      处理说明: '需要为新门店开通后台账号',
    },
  });
});

test('support ops create button backfills missing defaults before running its configured workflow', async () => {
  const project = loadSupportOps();
  const createButton = exportToComponentNodes(project.forms[0].design.components).find((component) => component.id === 'create_submit');
  assert.ok(createButton);
  const writes: Record<string, unknown> = {};
  const result = await executeFormControlEvent({
    eventName: 'onClick',
    field: createButton.name,
    value: undefined,
    values: {
      客户名称: '北海新能源',
      问题类型: '发票申请',
      优先级: '中',
      处理人: '王敏',
      处理说明: '',
    },
    originalValues: {},
    component: createButton,
  }, {
    workflows: project.workflows,
    tables: project.srcTable,
    components: exportToComponentNodes(project.forms[0].design.components),
    setValue: (field, value) => { writes[field] = value; },
    setVisible: () => {},
    setDisabled: () => {},
    setRequired: () => {},
    showMessage: () => {},
  });
  assert.equal(result.error, undefined);
  assert.equal(result.flowExecuted, true);
  assert.deepEqual(result.flowResult?.nodeResults.get('submit')?.outputs.writeBack, {
    kind: 'upsert-table-row',
    tableId: 'service_tickets',
    sheetName: '服务工单',
    keyField: '工单ID',
    keyValue: 1009,
    row: {
      工单ID: 1009,
      客户名称: '北海新能源',
      问题类型: '发票申请',
      优先级: '中',
      状态: '待分派',
      处理人: '王敏',
      创建日期: '2026-07-06',
      处理说明: '',
    },
  });
  assert.equal(writes['工单ID'], 1010);
  assert.equal(writes['状态'], '待分派');
  assert.equal(writes['创建日期'], '2026-07-06');
});

test('support ops example zip keeps release metadata and sheet behavior files', async () => {
  const buffer = readFileSync(join(repositoryRoot, 'projects', 'example_support_ops.zip'));
  const file = new File([buffer], 'example_support_ops.zip', { type: 'application/zip' });
  const project = await importFromZip(file);
  assert.ok(project);
  assert.equal(project.config.id, 'example_support_ops');
  assert.equal(project.release?.mode, 'use');
  assert.equal(project.sheetBehaviors?.find((entry) => entry.tableId === 'service_tickets')?.behaviors[0]?.id, 'bh_sheet_ticket_import_defaults');
});
