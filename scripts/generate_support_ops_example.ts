import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProjectPackage } from '../server/src/services/project-package-store';
import { exportToZip } from '../ui/src/project/packageManager';
import {
  createColumnRecord,
  createDefaultProjectRelease,
  createDefaultProjectSettings,
  createDefaultTableConfig,
  createRowRecord,
  type BehaviorFile,
  type ProjectStructure,
  type SrcSheetInfo,
  type SrcTableEntry,
} from '../ui/src/project/types';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const now = '2026-07-06T09:00:00.000Z';

const ticketRows = [
  { 工单ID: 1001, 客户名称: '华星零售', 问题类型: '账号开通', 优先级: '中', 状态: '待分派', 处理人: '李青', 创建日期: '2026-07-01', 处理说明: '' },
  { 工单ID: 1002, 客户名称: '远图物流', 问题类型: '发票申请', 优先级: '高', 状态: '处理中', 处理人: '王敏', 创建日期: '2026-07-02', 处理说明: '已回拨确认开票信息' },
  { 工单ID: 1003, 客户名称: '海辰制造', 问题类型: '数据修正', 优先级: '高', 状态: '待分派', 处理人: '赵宁', 创建日期: '2026-07-03', 处理说明: '' },
  { 工单ID: 1004, 客户名称: '青禾教育', 问题类型: '账号开通', 优先级: '低', 状态: '已完成', 处理人: '李青', 创建日期: '2026-07-04', 处理说明: '已发送开通邮件' },
];

const issueCatalogRows = [
  { 问题类型: '账号开通', 默认处理人: '李青', SLA小时: 4 },
  { 问题类型: '发票申请', 默认处理人: '王敏', SLA小时: 8 },
  { 问题类型: '数据修正', 默认处理人: '赵宁', SLA小时: 24 },
];

function buildSheetInfo(name: string, rows: Record<string, unknown>[]): SrcSheetInfo {
  const headers = Object.keys(rows[0] || {});
  return {
    name,
    rowCount: rows.length,
    colCount: headers.length,
    headers,
    columns: headers.map((header, index) => {
      const sample = rows.map((row) => row[header]).filter((value) => value != null);
      const first = sample[0];
      return {
        name: header,
        index,
        dataType: typeof first === 'number' ? 'number' as const : 'string' as const,
        nullable: sample.length < rows.length,
        uniqueCount: new Set(sample.map((value) => JSON.stringify(value))).size,
        sampleValues: sample.slice(0, 3),
      };
    }),
    preview: rows,
    config: undefined,
  };
}

function buildTable(
  id: string,
  fileName: string,
  sheetName: string,
  rows: Record<string, unknown>[],
  keyFields: string[],
  descriptions: Record<string, string>,
): SrcTableEntry {
  const sheet = buildSheetInfo(sheetName, rows);
  const config = createDefaultTableConfig(id, sheetName);
  config.keyFields = keyFields;
  config.columnDescriptions = descriptions;
  config.filterEnabled = true;
  config.sortEnabled = true;
  config.autoFitColumns = true;
  sheet.config = config;
  return {
    id,
    fileName,
    fileSize: JSON.stringify(rows).length,
    fileType: 'json',
    uploadedAt: now,
    dataHash: `${id}-${rows.length}`,
    sheets: [sheet],
    columnRecords: sheet.headers.map((header, index) => {
      const record = createColumnRecord(id, header, index);
      record.description = descriptions[header] || '';
      record.isPrimaryKey = keyFields.includes(header);
      return record;
    }),
    rowRecords: rows.map((_, index) => createRowRecord(id, index)),
  };
}

function behavior(id: string, name: string, event: string, code: string): BehaviorFile {
  return {
    id,
    name,
    event,
    code,
    priority: 10,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

const serviceTickets = buildTable(
  'service_tickets',
  '服务工单.json',
  '服务工单',
  ticketRows,
  ['工单ID'],
  {
    工单ID: '工单主键',
    客户名称: '客户名称',
    问题类型: '工单问题类别',
    优先级: '工单优先级',
    状态: '流转状态',
    处理人: '当前责任人',
    创建日期: '创建日期',
    处理说明: '处理备注',
  },
);

const issueCatalog = buildTable(
  'issue_catalog',
  '问题类型字典.json',
  '问题字典',
  issueCatalogRows,
  ['问题类型'],
  {
    问题类型: '问题分类编码',
    默认处理人: '默认责任人',
    SLA小时: '标准响应时效',
  },
);

const project: ProjectStructure = {
  config: {
    id: 'example_support_ops',
    name: '示例 · 服务工单闭环',
    description: '按项目创建规范构建的完整示例，覆盖数据表、双表单、事件、流程、工作表行为与使用模式。',
    version: '2.2.0',
    createdAt: now,
    updatedAt: now,
    author: 'FormFlow Studio',
    tags: ['示例', '工单', '规范化', '工作表行为', '使用模式'],
  },
  settings: {
    ...createDefaultProjectSettings(),
    publish: {
      format: 'json',
      allowWriteBack: true,
      generateChangeLog: true,
      outputFileName: 'support-ops-export',
    },
    updatedAt: now,
  },
  release: {
    ...createDefaultProjectRelease(),
    mode: 'use',
    defaultFormId: 'form_ticket_create',
    defaultSheet: '服务工单',
    allowDesigner: false,
    allowBehaviorEditor: false,
    allowWorkflowEditor: false,
    lastVerifiedAt: now,
  },
  srcTable: [serviceTickets, issueCatalog],
  workflows: [
    {
      id: 'wf_filter_open_tickets',
      name: '筛选待处理工单',
      description: '根据状态筛选服务工单，供查询修改表单使用。',
      nodes: [
        {
          id: 'source',
          type: 'generic',
          specId: 'generic:value-input',
          position: { x: 80, y: 160 },
          data: { propertiesJson: JSON.stringify({ name: 'tickets', valueType: 'array', value: ticketRows }) },
        },
        {
          id: 'filter',
          type: 'generic',
          specId: 'generic:filter',
          position: { x: 360, y: 160 },
          data: { propertiesJson: JSON.stringify({ field: '状态', operator: 'equals', value: '待分派' }) },
        },
        {
          id: 'display',
          type: 'generic',
          specId: 'generic:display-table',
          position: { x: 660, y: 160 },
          data: { propertiesJson: '{}' },
        },
      ],
      edges: [
        { id: 'edge-source-filter', source: 'source', target: 'filter', sourceHandle: 'out:value', targetHandle: 'in:data' },
        { id: 'edge-filter-display', source: 'filter', target: 'display', sourceHandle: 'out:result', targetHandle: 'in:data' },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'wf_create_ticket',
      name: '创建工单',
      description: '把创建表单中的工单写回服务工单数据表。',
      nodes: [
        {
          id: 'submit',
          type: 'formflow',
          specId: 'behavior:submit',
          position: { x: 320, y: 160 },
          data: {
            propertiesJson: JSON.stringify({
              validateFirst: true,
              target: 'changeLog',
              fileName: 'ticket-create',
              writeBackMode: 'upsert',
              writeBackTableId: 'service_tickets',
              writeBackSheetName: '服务工单',
              writeBackKeyField: '工单ID',
              writeBackKeyFormField: '工单ID',
              writeBackFieldMap: {
                工单ID: '工单ID',
                客户名称: '客户名称',
                问题类型: '问题类型',
                优先级: '优先级',
                状态: '状态',
                处理人: '处理人',
                创建日期: '创建日期',
                处理说明: '处理说明',
              },
            }),
          },
        },
      ],
      edges: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'wf_update_ticket',
      name: '更新工单',
      description: '把查询修改表单中的当前工单写回服务工单数据表。',
      nodes: [
        {
          id: 'submit',
          type: 'formflow',
          specId: 'behavior:submit',
          position: { x: 320, y: 160 },
          data: {
            propertiesJson: JSON.stringify({
              validateFirst: true,
              target: 'changeLog',
              fileName: 'ticket-update',
              writeBackMode: 'upsert',
              writeBackTableId: 'service_tickets',
              writeBackSheetName: '服务工单',
              writeBackKeyField: '工单ID',
              writeBackKeyFormField: '工单ID',
              writeBackFieldMap: {
                工单ID: '工单ID',
                客户名称: '客户名称',
                问题类型: '问题类型',
                优先级: '优先级',
                状态: '状态',
                处理人: '处理人',
                创建日期: '创建日期',
                处理说明: '处理说明',
              },
            }),
          },
        },
      ],
      edges: [],
      createdAt: now,
      updatedAt: now,
    },
  ],
  globalBehaviors: [
    behavior(
      'bh_global_submit_success',
      '统一提交成功提示',
      'onSubmitSuccess',
      "ctx.showMessage('项目级提示：工单数据已完成同步。', 'success');",
    ),
  ],
  sheetBehaviors: [
    {
      tableId: 'service_tickets',
      sheetName: '服务工单',
      updatedAt: now,
      behaviors: [
        behavior(
          'bh_sheet_ticket_import_defaults',
          '导入工单时补默认状态',
          'onDataImport',
          "if (!ctx.value?.状态) ctx.value.状态 = '待分派';\nif (!ctx.value?.优先级) ctx.value.优先级 = '中';",
        ),
        behavior(
          'bh_sheet_ticket_before_submit',
          '写回前清洗工单字段',
          'onBeforeSubmit',
          "const customer = String(ctx.getValue('客户名称') || '').trim();\nctx.setValue('客户名称', customer);\nif (!ctx.getValue('处理说明')) ctx.setValue('处理说明', '');",
        ),
      ],
    },
    {
      tableId: 'issue_catalog',
      sheetName: '问题字典',
      updatedAt: now,
      behaviors: [
        behavior(
          'bh_sheet_catalog_lookup',
          '字典表加载提示',
          'onRowLoad',
          "ctx.log?.('问题字典已装载');",
        ),
      ],
    },
  ],
  forms: [
    {
      id: 'form_ticket_create',
      name: '新建工单',
      createdAt: now,
      updatedAt: now,
      behaviors: [
        behavior(
          'bh_create_init',
          '打开新建工单表单时初始化',
          'onFormLoad',
          "const rows = ctx.querySheet('service_tickets');\nconst maxId = rows.reduce((max, row) => Math.max(max, Number(row?.工单ID) || 0), 0);\nctx.setValue('工单ID', maxId + 1);\nctx.setValue('优先级', '中');\nctx.setValue('状态', '待分派');\nctx.setValue('创建日期', '2026-07-06');\nctx.setValue('处理说明', '');\nctx.setValue('状态提示', `已为新工单分配编号：${maxId + 1}`);",
        ),
      ],
      design: {
        id: 'form_ticket_create',
        name: '新建工单',
        formMode: 'create',
        viewport: { zoom: 1, panX: 0, panY: 0 },
        gridSize: 10,
        createdAt: now,
        updatedAt: now,
        bindings: [],
        components: [
          { id: 'create_title', type: 'text', x: 24, y: 24, width: 620, height: 40, zIndex: 1, props: { content: '新建服务工单', fontSize: 22, fontWeight: 'bold' } },
          { id: 'create_status', type: 'text', x: 24, y: 68, width: 640, height: 28, zIndex: 1, fieldBinding: '状态提示', props: { name: 'statusHint', content: '填写客户与问题类型后即可创建工单。', fontSize: 13, color: '#64748b' } },
          { id: 'create_id', type: 'number', x: 24, y: 116, width: 160, height: 60, zIndex: 2, fieldBinding: '工单ID', props: { name: 'ticketId', label: '工单ID', readonly: true, placeholder: '自动生成' } },
          { id: 'create_customer', type: 'input', x: 204, y: 116, width: 240, height: 60, zIndex: 2, fieldBinding: '客户名称', props: { name: 'customerName', label: '客户名称', required: true, placeholder: '请输入客户名称', events: { onBlur: "const name = String(ctx.value || '').trim();\nawait ctx.setValue('客户名称', name);\nctx.setValue('状态提示', name ? `当前客户：${name}` : '请先填写客户名称。');" } } },
          { id: 'create_type', type: 'select', x: 464, y: 116, width: 200, height: 60, zIndex: 2, fieldBinding: '问题类型', props: { name: 'issueType', label: '问题类型', required: true, options: issueCatalogRows.map((row) => row.问题类型), events: { onChange: "const issueType = String(ctx.value || '');\nconst row = ctx.querySheet('issue_catalog').find((item) => item?.问题类型 === issueType);\nawait ctx.setValue('问题类型', issueType);\nawait ctx.setValue('处理人', row?.默认处理人 || '');\nctx.setValue('状态提示', issueType ? `已按问题类型分配处理人：${row?.默认处理人 || '待人工确认'}` : '请选择问题类型。');" } } },
          { id: 'create_priority', type: 'select', x: 24, y: 196, width: 160, height: 60, zIndex: 2, fieldBinding: '优先级', props: { name: 'priority', label: '优先级', options: ['低', '中', '高'], defaultValue: '中' } },
          { id: 'create_owner', type: 'input', x: 204, y: 196, width: 240, height: 60, zIndex: 2, fieldBinding: '处理人', props: { name: 'owner', label: '处理人', readonly: true, placeholder: '根据问题类型自动分配' } },
          { id: 'create_date', type: 'datePicker', x: 464, y: 196, width: 200, height: 60, zIndex: 2, fieldBinding: '创建日期', props: { name: 'createdAt', label: '创建日期', readonly: true } },
          { id: 'create_note', type: 'textarea', x: 24, y: 276, width: 640, height: 120, zIndex: 2, fieldBinding: '处理说明', props: { name: 'ticketNote', label: '问题描述', placeholder: '录入背景、影响范围和补充说明' } },
          {
            id: 'create_submit',
            type: 'button',
            x: 24,
            y: 420,
            width: 220,
            height: 50,
            zIndex: 3,
            props: {
              name: 'createTicket',
              label: '创建工单',
              variant: 'primary',
              events: {
                onClick: "const customer = String(ctx.getValue('客户名称') || '').trim();\nconst issueType = String(ctx.getValue('问题类型') || '').trim();\nif (!customer) return ctx.showMessage('请填写客户名称', 'error');\nif (!issueType) return ctx.showMessage('请选择问题类型', 'error');\nlet currentId = Number(ctx.getValue('工单ID') || 0);\nif (!currentId) {\n  const rows = ctx.querySheet('service_tickets');\n  currentId = rows.reduce((max, row) => Math.max(max, Number(row?.工单ID) || 0), 0) + 1;\n  await ctx.setValue('工单ID', currentId);\n}\nif (!ctx.getValue('状态')) await ctx.setValue('状态', '待分派');\nif (!ctx.getValue('创建日期')) await ctx.setValue('创建日期', '2026-07-06');\nawait ctx.runConfiguredWorkflow();\nawait ctx.setValue('工单ID', currentId + 1);\nawait ctx.setValue('客户名称', '');\nawait ctx.setValue('问题类型', '');\nawait ctx.setValue('优先级', '中');\nawait ctx.setValue('状态', '待分派');\nawait ctx.setValue('处理人', '');\nawait ctx.setValue('处理说明', '');\nawait ctx.setValue('创建日期', '2026-07-06');\nctx.setValue('状态提示', `工单 ${currentId} 已创建，可继续录入下一条。`);\nawait ctx.showMessage(`工单 ${currentId} 已创建`, 'success');",
              },
              flowTriggers: {
                onClick: {
                  enabled: true,
                  workflowId: 'wf_create_ticket',
                  parameterMap: {
                    'submit.formData': {
                      工单ID: '$form.工单ID',
                      客户名称: '$form.客户名称',
                      问题类型: '$form.问题类型',
                      优先级: '$form.优先级',
                      状态: '$form.状态',
                      处理人: '$form.处理人',
                      创建日期: '$form.创建日期',
                      处理说明: '$form.处理说明',
                    },
                  },
                },
              },
            },
          },
          { id: 'create_reset', type: 'button', x: 264, y: 420, width: 180, height: 50, zIndex: 3, props: { name: 'resetCreateTicket', label: '重置', variant: 'default', events: { onClick: "const rows = ctx.querySheet('service_tickets');\nconst maxId = rows.reduce((max, row) => Math.max(max, Number(row?.工单ID) || 0), 0);\nawait ctx.setValue('工单ID', maxId + 1);\nawait ctx.setValue('客户名称', '');\nawait ctx.setValue('问题类型', '');\nawait ctx.setValue('优先级', '中');\nawait ctx.setValue('状态', '待分派');\nawait ctx.setValue('处理人', '');\nawait ctx.setValue('处理说明', '');\nctx.setValue('状态提示', '表单已重置，可录入新的服务工单。');" } } },
        ],
      },
    },
    {
      id: 'form_ticket_dispatch',
      name: '查询与处理',
      createdAt: now,
      updatedAt: now,
      behaviors: [
        behavior(
          'bh_dispatch_init',
          '打开处理表单时加载待分派工单',
          'onFormLoad',
          "const rows = ctx.querySheet('service_tickets').filter((row) => row?.状态 === '待分派');\nctx.setValue('工单列表', rows);\nctx.setValue('处理提示', `已加载 ${rows.length} 条待分派工单`);",
        ),
      ],
      design: {
        id: 'form_ticket_dispatch',
        name: '查询与处理',
        formMode: 'lookup-edit',
        viewport: { zoom: 1, panX: 0, panY: 0 },
        gridSize: 10,
        createdAt: now,
        updatedAt: now,
        bindings: [],
        components: [
          { id: 'dispatch_title', type: 'text', x: 24, y: 24, width: 620, height: 40, zIndex: 1, props: { content: '查询与处理工单', fontSize: 22, fontWeight: 'bold' } },
          { id: 'dispatch_hint', type: 'text', x: 24, y: 68, width: 720, height: 28, zIndex: 1, fieldBinding: '处理提示', props: { name: 'dispatchHint', content: '先筛选，再点击表格中的工单进入处理。', fontSize: 13, color: '#64748b' } },
          { id: 'dispatch_filter', type: 'select', x: 24, y: 116, width: 180, height: 60, zIndex: 2, fieldBinding: '筛选状态', props: { name: 'filterStatus', label: '状态筛选', options: ['待分派', '处理中', '已完成'], defaultValue: '待分派' } },
          {
            id: 'dispatch_search',
            type: 'button',
            x: 224,
            y: 116,
            width: 180,
            height: 50,
            zIndex: 2,
            props: {
              name: 'searchTickets',
              label: '查询工单',
              variant: 'primary',
              events: {
                onClick: "const result = await ctx.runConfiguredWorkflow();\nconst rows = result.nodeResults.get('filter')?.outputs.result || [];\nawait ctx.setValue('工单列表', rows);\nctx.setValue('处理提示', `已筛选出 ${rows.length} 条工单`);",
              },
              flowTriggers: {
                onClick: {
                  enabled: true,
                  workflowId: 'wf_filter_open_tickets',
                  parameterMap: {
                    'filter.value': '$form.筛选状态',
                  },
                },
              },
            },
          },
          { id: 'dispatch_table', type: 'table', x: 24, y: 196, width: 520, height: 240, zIndex: 2, fieldBinding: '工单列表', props: { name: 'ticketTable', columns: ['工单ID', '客户名称', '问题类型', '优先级', '状态', '处理人'], rows: 4, events: { onRowClick: "const row = ctx.detail?.row || {};\nawait ctx.setValue('工单ID', row.工单ID || '');\nawait ctx.setValue('客户名称', row.客户名称 || '');\nawait ctx.setValue('问题类型', row.问题类型 || '');\nawait ctx.setValue('优先级', row.优先级 || '中');\nawait ctx.setValue('状态', row.状态 || '待分派');\nawait ctx.setValue('处理人', row.处理人 || '');\nawait ctx.setValue('创建日期', row.创建日期 || '');\nawait ctx.setValue('处理说明', row.处理说明 || '');\nawait ctx.setValue('原始工单ID', row.工单ID || '');\nawait ctx.setValue('原始客户名称', row.客户名称 || '');\nawait ctx.setValue('原始问题类型', row.问题类型 || '');\nawait ctx.setValue('原始优先级', row.优先级 || '');\nawait ctx.setValue('原始状态', row.状态 || '');\nawait ctx.setValue('原始处理人', row.处理人 || '');\nawait ctx.setValue('原始创建日期', row.创建日期 || '');\nawait ctx.setValue('原始处理说明', row.处理说明 || '');\nctx.setValue('处理提示', `已载入工单 ${row.工单ID}`);" } } },
          { id: 'dispatch_id', type: 'number', x: 568, y: 196, width: 180, height: 60, zIndex: 2, fieldBinding: '工单ID', props: { name: 'editingTicketId', label: '工单ID', readonly: true } },
          { id: 'dispatch_customer', type: 'input', x: 568, y: 276, width: 220, height: 60, zIndex: 2, fieldBinding: '客户名称', props: { name: 'editingCustomer', label: '客户名称', readonly: true } },
          { id: 'dispatch_type', type: 'input', x: 808, y: 276, width: 180, height: 60, zIndex: 2, fieldBinding: '问题类型', props: { name: 'editingIssueType', label: '问题类型', readonly: true } },
          { id: 'dispatch_priority', type: 'select', x: 568, y: 356, width: 180, height: 60, zIndex: 2, fieldBinding: '优先级', props: { name: 'editingPriority', label: '优先级', options: ['低', '中', '高'] } },
          { id: 'dispatch_status', type: 'select', x: 768, y: 356, width: 180, height: 60, zIndex: 2, fieldBinding: '状态', props: { name: 'editingStatus', label: '状态', options: ['待分派', '处理中', '已完成'] } },
          { id: 'dispatch_owner', type: 'input', x: 568, y: 436, width: 180, height: 60, zIndex: 2, fieldBinding: '处理人', props: { name: 'editingOwner', label: '处理人' } },
          { id: 'dispatch_note', type: 'textarea', x: 768, y: 436, width: 220, height: 110, zIndex: 2, fieldBinding: '处理说明', props: { name: 'editingNote', label: '处理说明', placeholder: '填写派单、跟进或完成备注' } },
          {
            id: 'dispatch_update',
            type: 'button',
            x: 568,
            y: 566,
            width: 220,
            height: 50,
            zIndex: 3,
            props: {
              name: 'saveTicketUpdate',
              label: '保存处理结果',
              variant: 'primary',
              events: {
                onClick: "const id = Number(ctx.getValue('工单ID') || 0);\nif (!id) return ctx.showMessage('请先从左侧表格选择工单', 'error');\nawait ctx.runConfiguredWorkflow();\nctx.setValue('处理提示', `工单 ${id} 已更新`);\nawait ctx.showMessage(`工单 ${id} 已同步`, 'success');",
              },
              flowTriggers: {
                onClick: {
                  enabled: true,
                  workflowId: 'wf_update_ticket',
                  parameterMap: {
                    'submit.formData': {
                      工单ID: '$form.工单ID',
                      客户名称: '$form.客户名称',
                      问题类型: '$form.问题类型',
                      优先级: '$form.优先级',
                      状态: '$form.状态',
                      处理人: '$form.处理人',
                      创建日期: '$form.创建日期',
                      处理说明: '$form.处理说明',
                    },
                    'submit.originalData': {
                      工单ID: '$form.原始工单ID',
                      客户名称: '$form.原始客户名称',
                      问题类型: '$form.原始问题类型',
                      优先级: '$form.原始优先级',
                      状态: '$form.原始状态',
                      处理人: '$form.原始处理人',
                      创建日期: '$form.原始创建日期',
                      处理说明: '$form.原始处理说明',
                    },
                  },
                },
              },
            },
          },
        ],
      },
    },
  ],
  outputs: [
    {
      id: 'output_open_ticket_list',
      name: '待处理工单列表',
      format: 'json',
      size: 0,
      createdAt: now,
    },
  ],
};

const outputDir = join(root, 'projects');
mkdirSync(outputDir, { recursive: true });
writeProjectPackage(project);
const zip = await exportToZip(project);
writeFileSync(join(outputDir, 'example_support_ops.zip'), new Uint8Array(await zip.arrayBuffer()));
console.log(`Generated support ops example: ${project.config.id}`);
