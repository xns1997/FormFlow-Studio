/**
 * Central per-tool call guidance for the seven domain skills.
 *
 * Every tool gets three pieces of documentation in the generated skill and in
 * the Expert Management UI:
 * - 传參：由 inputSchema + FIELD_DESCRIPTIONS 自动生成（必填/可选、类型、说明）；
 * - 正确调用：tool.examples（工具定义内）+ 本文件 examples（补齐缺少示例的工具）；
 * - 错误调用：本文件 wrong（每个都说明为什么错 + 预期错误）。
 *
 * 只在这里维护示例即可，无需改工具 handler。禁止把错误示例写入工具定义的正例。
 */
import type { ToolExample, ToolWrongExample } from '../services/tool-shared';

export interface ToolCallGuidance {
  /** 正确调用示例（仅用于工具定义中缺少 examples 的工具）。 */
  examples?: ToolExample[];
  /** 错误调用示例：禁止照抄，用于教学与失败修复。 */
  wrong: ToolWrongExample[];
}

/** 工具调用指南（参数规范与注意事项）。 */
export const TOOL_CALL_GUIDANCE: Record<string, ToolCallGuidance> = {
  // ─── project 领域 ──────────────────────────────────────────────────────────
  'system.capabilities.get': {
    wrong: [
      { summary: '该工具没有任何参数，传任意参数都会被拒。', arguments: { role: 'data' }, expectedError: 'UNKNOWN_ARGUMENT' },
    ],
  },
  'catalog.templates.list': {
    wrong: [
      { summary: 'list 类目录工具无参数，不需要也不能传过滤条件。', arguments: { category: '制造' }, expectedError: 'UNKNOWN_ARGUMENT' },
    ],
  },
  'catalog.form_templates.list': {
    wrong: [
      { summary: '目录列表没有参数；查看单个模板应改用 catalog.form_templates.get。', arguments: { key: 'lookup-edit' }, expectedError: 'UNKNOWN_ARGUMENT' },
    ],
  },
  'catalog.form_templates.get': {
    wrong: [
      { summary: 'key 必须来自 catalog.form_templates.list 返回的真实模板键，不能猜。', arguments: { key: 'detail-master' }, expectedError: '表单模板不存在' },
    ],
  },
  'catalog.operation_templates.list': {
    wrong: [
      { summary: 'projectId 不存在时拿不到项目内自定义模板。', arguments: { projectId: 'not_exists' }, expectedError: 'PROJECT_NOT_FOUND' },
    ],
  },
  'catalog.operation_templates.get': {
    wrong: [
      { summary: 'templateId 必须先在目录中读取，不能凭印象拼。', arguments: { projectId: 'device_mgmt', templateId: 'employee' }, expectedError: '模板不存在' },
    ],
  },
  'catalog.components.list': {
    wrong: [
      { summary: '目录列表无参数；查单个控件请用 catalog.components.get。', arguments: { type: 'input' }, expectedError: 'UNKNOWN_ARGUMENT' },
    ],
  },
  'catalog.components.get': {
    wrong: [
      { summary: 'type 不在注册控件中会返回不存在。', arguments: { type: 'inputx' }, expectedError: '控件不存在' },
    ],
  },
  'catalog.workflow_nodes.list': {
    wrong: [
      { summary: '目录列表无参数；查单个节点请用 catalog.workflow_nodes.get。', arguments: { id: 'behavior-condition' }, expectedError: 'UNKNOWN_ARGUMENT' },
    ],
  },
  'catalog.workflow_nodes.get': {
    wrong: [
      { summary: 'id 必须来自节点目录，不能编造。', arguments: { id: 'not-a-node' }, expectedError: '节点不存在' },
    ],
  },
  'catalog.events.list': {
    wrong: [
      { summary: '事件目录无参数。', arguments: { scope: 'form' }, expectedError: 'UNKNOWN_ARGUMENT' },
    ],
  },

  // ─── project 领域 ──────────────────────────────────────────────────────────
  'project.list': {
    wrong: [
      { summary: 'list 无参数；定位项目后再用 project.get 读取。', arguments: { projectId: 'device_mgmt' }, expectedError: 'UNKNOWN_ARGUMENT' },
    ],
  },
  'project.get': {
    wrong: [
      { summary: 'projectId 写错或不存在直接失败，且返回的 revision 必须用于后续写操作。', arguments: { projectId: 'device' }, expectedError: 'PROJECT_NOT_FOUND' },
    ],
  },
  'project.inspect': {
    wrong: [
      { summary: 'projectId 不存在时无摘要可读。', arguments: { projectId: 'not_exists' }, expectedError: 'PROJECT_NOT_FOUND' },
    ],
  },
  'project.validate': {
    wrong: [
      { summary: '校验前应确认项目已写完成；缺主键的可编辑表会报错。', arguments: { projectId: 'device_mgmt' }, expectedError: 'MISSING_KEY（可编辑 Sheet 必须配置主键）' },
    ],
  },
  'project.create': {
    wrong: [
      { summary: '写操作必须带 idempotencyKey，否则不会执行。', arguments: { id: 'device_mgmt', name: '设备巡检' }, expectedError: 'IDEMPOTENCY_KEY_REQUIRED' },
      { summary: 'id 已存在时不能再建。', arguments: { id: 'device_mgmt', name: '设备巡检', idempotencyKey: 'dup-1' }, expectedError: 'PROJECT_EXISTS' },
    ],
  },
  'project.initialize': {
    wrong: [
      { summary: 'templateId 必须先从 catalog.templates.list 读取，不能猜测。', arguments: { id: 'device_mgmt', name: '设备巡检', templateId: 'manufacture', idempotencyKey: 'init-1' }, expectedError: 'TEMPLATE_NOT_FOUND' },
    ],
  },
  'project.update': {
    wrong: [
      { summary: '旧 baseRevision 会被拒，必须先重新 project.get。', arguments: { projectId: 'device_mgmt', baseRevision: '<旧值>', idempotencyKey: 'upd-1', config: { description: 'x' } }, expectedError: 'PROJECT_REVISION_CONFLICT' },
      { summary: 'release 草稿必须走 delivery 的 release.update，project.update 不接收。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'upd-2', release: { mode: 'test' } }, expectedError: 'INVALID_ARGUMENT' },
    ],
  },
  'project.clone': {
    wrong: [
      { summary: 'newId 已存在时克隆失败，需要换新 ID。', arguments: { projectId: 'device_mgmt', newId: 'device_mgmt', idempotencyKey: 'clone-1' }, expectedError: 'PROJECT_EXISTS' },
    ],
  },
  'project.delete': {
    wrong: [
      { summary: '首次调用只返回 confirmation_required，等待用户确认后带 confirmationToken 再调；不要当成失败重试。', arguments: { projectId: 'device_mgmt', idempotencyKey: 'del-1' }, expectedError: 'confirmation_required' },
    ],
  },
  'project.diff': {
    wrong: [
      { summary: '缺 patch 无法比较。', arguments: { projectId: 'device_mgmt' }, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'project.import': {
    wrong: [
      { summary: 'fileId 必须是上传接口返回的暂存 ID；过期或错误都取不到文件。', arguments: { fileId: 'stale-id', idempotencyKey: 'import-1' }, expectedError: 'FILE_NOT_FOUND' },
      { summary: 'overwrite=true 会覆盖现有项目，必须等用户确认。', arguments: { fileId: '<fileId>', projectId: 'device_mgmt', overwrite: true, idempotencyKey: 'import-2' }, expectedError: 'confirmation_required' },
    ],
  },
  'project.build_from_data': {
    wrong: [
      { summary: '把字段定义（fieldId/title/type）放进 rows，rows 只接受业务记录。', arguments: { id: 'device_mgmt', name: '设备巡检', idempotencyKey: 'build-1', dataSource: { id: 'device', rows: [{ fieldId: '编号', title: '编号', type: 'string' }] } }, expectedError: 'DATA_SOURCE_INPUT_AMBIGUOUS / 主键校验失败' },
      { summary: '可编辑表缺 keyFields 且没有编号/id 类列时无法建主键。', arguments: { id: 'device_mgmt', name: '设备巡检', idempotencyKey: 'build-2', dataSource: { id: 'device', rows: [{ 名称: 'A' }] } }, expectedError: 'MISSING_KEY' },
    ],
  },
  'project.export': {
    wrong: [
      { summary: 'projectId 拼错时无包可导出。', arguments: { projectId: 'device' }, expectedError: 'PROJECT_NOT_FOUND' },
    ],
  },
  'project.package.export': {
    wrong: [
      { summary: 'projectId 拼错时无包可导出。', arguments: { projectId: 'device' }, expectedError: 'PROJECT_NOT_FOUND' },
    ],
  },
  'project.package.validate': {
    wrong: [
      { summary: 'projectId 拼错时无项目可校验。', arguments: { projectId: 'device' }, expectedError: 'PROJECT_NOT_FOUND' },
    ],
  },
  'project.quality.inspect': {
    wrong: [
      { summary: 'projectId 拼错时无项目可检查。', arguments: { projectId: 'device' }, expectedError: 'PROJECT_NOT_FOUND' },
    ],
  },

  // ─── data 领域 ─────────────────────────────────────────────────────────────
  'data_source.list': {
    wrong: [
      { summary: 'projectId 必填，缺省无法定位项目。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'data_source.get': {
    wrong: [
      { summary: 'id 必须来自 data_source.list 返回的表 id。', arguments: { projectId: 'device_mgmt', id: 'devicex' }, expectedError: 'TABLE_NOT_FOUND' },
    ],
  },
  'data_source.create': {
    wrong: [
      { summary: 'rows 是业务记录数组，不是字段定义；字段定义必须放 config.columns。', arguments: { projectId: 'device_mgmt', id: 'device', rows: [{ fieldId: '编号', title: '编号', type: 'string' }] }, expectedError: 'DATA_SOURCE_INPUT_AMBIGUOUS / 列结构错误' },
      { summary: 'fileId、csv、rows 三者互斥，同时提供多个来源会被拒。', arguments: { projectId: 'device_mgmt', id: 'device', fileId: '<f>', csv: '编号,名称\nD-001,机床A' }, expectedError: 'DATA_SOURCE_INPUT_AMBIGUOUS' },
      { summary: '可编辑表必须配置 config.keyFields。', arguments: { projectId: 'device_mgmt', id: 'device', config: { columns: [{ name: '编号', type: 'string' }] } }, expectedError: 'DATA_KEY_REQUIRED' },
    ],
  },
  'data_source.import': {
    wrong: [
      { summary: 'import 与 create 相同约束：数据内容三选一，可编辑表必须有主键。', arguments: { projectId: 'device_mgmt', id: 'device', fileId: '<f>', rows: [{ 编号: 'D-001' }] }, expectedError: 'DATA_SOURCE_INPUT_AMBIGUOUS' },
    ],
  },
  'data_source.update': {
    wrong: [
      { summary: 'rows/sheets/dataHash 等受保护字段只能由专用数据接口修改。', arguments: { projectId: 'device_mgmt', id: 'device', baseRevision: '<revision>', idempotencyKey: 'upd-1', patch: { rows: [] } }, expectedError: 'PROTECTED_DATA_FIELD' },
    ],
  },
  'data_source.delete': {
    wrong: [
      { summary: '表仍被表单引用时，不显式 cascade 会被拒。', arguments: { projectId: 'device_mgmt', id: 'device', baseRevision: '<revision>', idempotencyKey: 'del-1' }, expectedError: 'RESOURCE_REFERENCED' },
      { summary: '破坏性操作首次调用只返回 confirmation_required。', arguments: { projectId: 'device_mgmt', id: 'device', baseRevision: '<revision>', idempotencyKey: 'del-2', cascade: true }, expectedError: 'confirmation_required' },
    ],
  },
  'data_sheet.get': {
    wrong: [
      { summary: 'sheetName 必须与真实 Sheet 名完全一致（区分大小写）。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'sheet1' }, expectedError: 'SHEET_NOT_FOUND' },
    ],
  },
  'data_sheet.configure': {
    wrong: [
      { summary: 'keyFields 必须使用真实列名，否则主键校验失败。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', baseRevision: '<revision>', idempotencyKey: 'cfg-1', config: { keyFields: ['编号x'] } }, expectedError: 'DATA_KEY_REQUIRED / 校验失败' },
      { summary: '写操作使用旧 baseRevision 会被拒。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', baseRevision: '<旧值>', idempotencyKey: 'cfg-2', config: { readOnly: false } }, expectedError: 'PROJECT_REVISION_CONFLICT' },
    ],
  },
  'data_keys.validate': {
    wrong: [
      { summary: 'keyFields 与列名不一致时校验出的全是无效键。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', keyFields: ['编号x'] }, expectedError: '校验失败（key 不存在于列定义）' },
    ],
  },
  'data_rows.query': {
    wrong: [
      { summary: 'pageSize 上限 500，超过会被拒。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', page: 1, pageSize: 1000 }, expectedError: 'NUMBER_TOO_LARGE（最大 500）' },
    ],
  },
  'data_rows.batch': {
    wrong: [
      { summary: '新增行主键字段为空会被整批拒绝。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', baseRevision: '<revision>', idempotencyKey: 'rows-1', adds: [{ 编号: '', 名称: 'A' }] }, expectedError: 'DATA_KEY_VALUE_EMPTY' },
      { summary: 'deletes 非空时必须先确认。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', baseRevision: '<revision>', idempotencyKey: 'rows-2', deletes: ['key:D-001'] }, expectedError: 'confirmation_required' },
      { summary: 'baseVersion 过期时整批拒绝，避免覆盖并发修改。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', baseRevision: '<revision>', baseVersion: '<旧值>', idempotencyKey: 'rows-3', updates: [{ rowKey: 'key:D-001', changes: { 评分: 95 } }] }, expectedError: 'DATA_VERSION_CONFLICT' },
    ],
  },
  'data_rows.transaction': {
    wrong: [
      { summary: 'operations 引用不存在的表/Sheet 会整体失败。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'tx-1', operations: [{ tableId: 'devicex', sheetName: 'Sheet1', adds: [{ 编号: 'D-003' }] }] }, expectedError: 'TABLE_NOT_FOUND' },
      { summary: 'operations 内含 deletes 时必须先确认。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'tx-2', operations: [{ tableId: 'device', sheetName: 'Sheet1', deletes: ['key:D-001'] }] }, expectedError: 'confirmation_required' },
    ],
  },
  'data_relation.list': {
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'data_relation.suggest': {
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'data_relation.validate': {
    wrong: [
      { summary: 'relation 缺少两端表、字段或类型不兼容时校验失败。', arguments: { projectId: 'device_mgmt', relation: { id: 'r1', name: '设备-日志', left: { tableId: 'device', fields: ['编号'] }, right: { tableId: 'log', fields: ['device_id'] }, cardinality: 'one-to-many' } }, expectedError: 'RELATION_INVALID（缺 Sheet/字段不兼容）' },
    ],
  },
  'data_relation.upsert': {
    wrong: [
      { summary: 'relation 必须包含 id。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'rel-1', relation: { name: '设备-负责人' } }, expectedError: 'REQUIRED_ARGUMENT（relation.id）' },
    ],
  },
  'data_relation.delete': {
    wrong: [
      { summary: '关系仍被模板实例引用且未 cascade 时会被拒。', arguments: { projectId: 'device_mgmt', id: 'device_owner', baseRevision: '<revision>', idempotencyKey: 'rel-del-1' }, expectedError: 'RESOURCE_REFERENCED' },
      { summary: '破坏性操作必须等确认。', arguments: { projectId: 'device_mgmt', id: 'device_owner', baseRevision: '<revision>', idempotencyKey: 'rel-del-2', cascade: true }, expectedError: 'confirmation_required' },
    ],
  },
  'data_relation.query': {
    wrong: [
      { summary: 'relationId 必须来自 data_relation.list。', arguments: { projectId: 'device_mgmt', relationId: 'not_a_relation' }, expectedError: '关系不存在' },
    ],
  },

  // ─── data_table 领域（data） ───────────────────────────────────────────────
  'data_table.create': {
    wrong: [
      { summary: '可编辑表没有可推断主键（编号/id/code/号 类列）时必须显式给 keyFields。', arguments: { projectId: 'device_mgmt', id: 'log', baseRevision: '<revision>', idempotencyKey: 'tbl-1', columns: [{ name: '内容', type: 'text' }] }, expectedError: 'MISSING_KEY' },
      { summary: 'keyFields 必须与 columns.name 完全一致。', arguments: { projectId: 'device_mgmt', id: 'device', baseRevision: '<revision>', idempotencyKey: 'tbl-2', columns: [{ name: '编号', type: 'string' }], keyFields: ['ID'] }, expectedError: '主键校验失败' },
      { summary: 'rows 的键必须与列名一致，否则该行数据对不上列。', arguments: { projectId: 'device_mgmt', id: 'device', baseRevision: '<revision>', idempotencyKey: 'tbl-3', columns: [{ name: '编号', type: 'string' }], keyFields: ['编号'], rows: [{ id: 'D-001' }] }, expectedError: '主键校验失败（rows 键不是编号）' },
    ],
  },

  // ─── form 领域 ─────────────────────────────────────────────────────────────
  'form.list': {
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'form.get': {
    wrong: [
      { summary: 'id 必须来自 form.list 或项目摘要。', arguments: { projectId: 'device_mgmt', id: 'device_editx' }, expectedError: 'FORM_NOT_FOUND' },
    ],
  },
  'form.create': {
    wrong: [
      { summary: '写操作必须带 idempotencyKey。', arguments: { projectId: 'device_mgmt', id: 'device_create', name: '设备录入' }, expectedError: 'IDEMPOTENCY_KEY_REQUIRED' },
      { summary: 'id 已存在时创建失败，改用它读取后 form.update 或换新 id。', arguments: { projectId: 'device_mgmt', id: 'device_edit', name: '设备编辑', mode: 'edit', baseRevision: '<revision>', idempotencyKey: 'form-1' }, expectedError: 'FORM_EXISTS' },
    ],
  },
  'form.generate_from_table': {
    wrong: [
      { summary: 'tableId 必须来自 data_source.list。', arguments: { projectId: 'device_mgmt', tableId: 'devicex', sheetName: 'Sheet1', id: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'form-2' }, expectedError: 'TABLE_NOT_FOUND' },
      { summary: 'id 必须是新表单 id，不能覆盖已有表单。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', id: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'form-3' }, expectedError: 'FORM_EXISTS' },
    ],
  },
  'form.update': {
    wrong: [
      { summary: 'ruleCode 和 behaviors 只能由 behavior 领域写入，form.update 会被拒。', arguments: { projectId: 'device_mgmt', id: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'upd-1', patch: { ruleCode: 'when $状态 == "停用" -> message("x")' } }, expectedError: 'INVALID_ARGUMENT（ruleCode/behaviors 必须走 behavior MCP）' },
    ],
  },
  'form.delete': {
    wrong: [
      { summary: '表单是 release 默认表单且未 cascade 时被拒。', arguments: { projectId: 'device_mgmt', id: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'del-1' }, expectedError: 'RESOURCE_REFERENCED' },
      { summary: '破坏性操作必须等确认。', arguments: { projectId: 'device_mgmt', id: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'del-2', cascade: true }, expectedError: 'confirmation_required' },
    ],
  },
  'form_component.upsert': {
    wrong: [
      { summary: '表单窗体是实例固有配置，不能作为控件新增。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'cmp-1', item: { id: 'window', type: 'form' } }, expectedError: 'FORM_WINDOW_IS_INTRINSIC' },
      { summary: 'item.id 为空无法定位控件。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'cmp-2', item: { type: 'input', props: {} } }, expectedError: 'INVALID_ID' },
      { summary: '按钮事件脚本必须是非空字符串。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'cmp-3', item: { id: 'btn', type: 'button', props: { events: { onClick: '' } } } }, expectedError: '校验失败（事件脚本为空）' },
    ],
  },
  'form_binding.upsert': {
    wrong: [
      { summary: 'item.id 为空无法定位绑定。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'bnd-1', item: { sourceId: 'device', targetId: 'device_edit' } }, expectedError: 'INVALID_ID' },
      { summary: 'sourceId 引用不存在的资源时绑定无效。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'bnd-2', item: { id: 'b1', sourceId: 'devicex', targetId: 'device_edit', type: 'table', config: { tableId: 'devicex', sheetName: 'Sheet1' } } }, expectedError: '校验失败（数据源不存在）' },
    ],
  },
  'form_component.delete': {
    wrong: [
      { summary: '删除控件会级联清理子控件与绑定，必须等确认。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', id: 'field_score', baseRevision: '<revision>', idempotencyKey: 'del-1' }, expectedError: 'confirmation_required' },
    ],
  },
  'form_binding.delete': {
    wrong: [
      { summary: '破坏性操作必须等确认。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', id: 'device_binding', baseRevision: '<revision>', idempotencyKey: 'del-2' }, expectedError: 'confirmation_required' },
    ],
  },
  'form.preview': {
    wrong: [
      { summary: 'formId 不存在时无法预览。', arguments: { projectId: 'device_mgmt', formId: 'device_editx' }, expectedError: 'FORM_NOT_FOUND' },
    ],
  },
  'form_state.read': {
    wrong: [
      { summary: 'formId 必填，缺省无法定位表单。', arguments: { projectId: 'device_mgmt' }, expectedError: 'REQUIRED_ARGUMENT / FORM_NOT_FOUND' },
    ],
  },

  // ─── workflow 领域 ─────────────────────────────────────────────────────────
  'workflow.list': {
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'workflow.get': {
    wrong: [
      { summary: 'id 必须来自 workflow.list。', arguments: { projectId: 'device_mgmt', id: 'device_reviewx' }, expectedError: 'WORKFLOW_NOT_FOUND' },
    ],
  },
  'workflow.create': {
    wrong: [
      { summary: 'create 使用已存在的 id 会被拒；更新应使用 workflow.update。', arguments: { projectId: 'device_mgmt', id: 'device_review', baseRevision: '<revision>', idempotencyKey: 'wf-1', item: { id: 'device_review', name: '重复', nodes: [], edges: [] } }, expectedError: 'RESOURCE_EXISTS' },
      { summary: '边端口必须带 out:/in: 前缀，否则流程校验失败。', arguments: { projectId: 'device_mgmt', id: 'wf1', baseRevision: '<revision>', idempotencyKey: 'wf-2', item: { id: 'wf1', name: '坏边', nodes: [{ id: 'n1', specId: 'behavior-notify' }], edges: [{ id: 'e1', source: 'n1', target: 'n1' }] } }, expectedError: 'PROJECT_VALIDATION_FAILED' },
    ],
  },
  'workflow.update': {
    wrong: [
      { summary: 'item.id 为空会失败；必须给稳定 ID。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'wf-3', item: { name: '无 ID' } }, expectedError: 'INVALID_ID' },
    ],
  },
  'workflow.delete': {
    wrong: [
      { summary: '流程仍被表单引用且未 cascade 时被拒。', arguments: { projectId: 'device_mgmt', id: 'device_review', baseRevision: '<revision>', idempotencyKey: 'wf-del-1' }, expectedError: 'RESOURCE_REFERENCED' },
      { summary: '破坏性操作必须等确认。', arguments: { projectId: 'device_mgmt', id: 'device_review', baseRevision: '<revision>', idempotencyKey: 'wf-del-2', cascade: true }, expectedError: 'confirmation_required' },
    ],
  },
  'workflow_node.upsert': {
    wrong: [
      { summary: 'item 缺 id 无法定位节点。', arguments: { projectId: 'device_mgmt', workflowId: 'device_review', baseRevision: '<revision>', idempotencyKey: 'node-1', item: { specId: 'behavior-condition' } }, expectedError: 'INVALID_ID' },
      { summary: 'specId 必须来自 catalog.workflow_nodes。', arguments: { projectId: 'device_mgmt', workflowId: 'device_review', baseRevision: '<revision>', idempotencyKey: 'node-2', item: { id: 'n9', specId: 'not-a-node' } }, expectedError: '校验失败（节点类型不存在）' },
    ],
  },
  'workflow_edge.upsert': {
    wrong: [
      { summary: 'source/target 必须引用真实存在的节点。', arguments: { projectId: 'device_mgmt', workflowId: 'device_review', baseRevision: '<revision>', idempotencyKey: 'edge-1', item: { id: 'e9', source: 'n9', sourceHandle: 'out:trigger', target: 'n1', targetHandle: 'in:trigger' } }, expectedError: 'PROJECT_VALIDATION_FAILED' },
    ],
  },
  'workflow_node.delete': {
    wrong: [
      { summary: '节点仍被连线引用且未 cascade 时被拒。', arguments: { projectId: 'device_mgmt', workflowId: 'device_review', id: 'n1', baseRevision: '<revision>', idempotencyKey: 'del-1' }, expectedError: 'RESOURCE_REFERENCED' },
      { summary: '破坏性操作必须等确认。', arguments: { projectId: 'device_mgmt', workflowId: 'device_review', id: 'n1', baseRevision: '<revision>', idempotencyKey: 'del-2', cascade: true }, expectedError: 'confirmation_required' },
    ],
  },
  'workflow_edge.delete': {
    wrong: [
      { summary: '破坏性操作必须等确认。', arguments: { projectId: 'device_mgmt', workflowId: 'device_review', id: 'e1', baseRevision: '<revision>', idempotencyKey: 'del-3' }, expectedError: 'confirmation_required' },
    ],
  },
  'workflow.validate': {
    wrong: [
      { summary: 'id 不存在时无法校验。', arguments: { projectId: 'device_mgmt', id: 'device_reviewx' }, expectedError: 'WORKFLOW_NOT_FOUND' },
    ],
  },

  // ─── behavior 领域 ─────────────────────────────────────────────────────────
  'behavior.list': {
    wrong: [
      { summary: 'scope=form 时必须提供 formId。', arguments: { projectId: 'device_mgmt', scope: 'form' }, expectedError: 'REQUIRED_ARGUMENT（formId）' },
      { summary: 'scope=sheet 时必须提供 tableId 与 sheetName。', arguments: { projectId: 'device_mgmt', scope: 'sheet', tableId: 'device' }, expectedError: 'REQUIRED_ARGUMENT（sheetName）' },
      { summary: 'scope 只接受 global/sheet/form。', arguments: { projectId: 'device_mgmt', scope: 'page' }, expectedError: 'INVALID_ARGUMENT' },
    ],
  },
  'behavior.upsert': {
    examples: [
      { summary: '表单作用域保存行为（必须带 scope=form 与 formId）', arguments: { projectId: 'device_mgmt', scope: 'form', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'beh-1', behavior: { id: 'beh_score_guard', name: '评分低于60提示', trigger: { type: 'submit' }, conditions: [], actions: [{ type: 'showMessage', messageType: 'warning', message: '评分过低' }] } } },
    ],
    wrong: [
      { summary: 'actions 至少一项，空数组会被 schema 拒绝。', arguments: { projectId: 'device_mgmt', scope: 'form', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'beh-1', behavior: { id: 'b1', name: '空行为', trigger: { type: 'submit' }, conditions: [], actions: [] } }, expectedError: 'ARRAY_TOO_SHORT（actions 至少 1 项）' },
      { summary: 'trigger.type 必须来自事件目录。', arguments: { projectId: 'device_mgmt', scope: 'form', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'beh-2', behavior: { id: 'b2', name: '坏触发器', trigger: { type: 'onSave' }, conditions: [], actions: [{ type: 'showMessage', message: 'x' }] } }, expectedError: 'INVALID_ARGUMENT_ENUM' },
      { summary: '缺少 scope 会被 schema 拒绝；scope 只接受 global/sheet/form。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'beh-3', behavior: { id: 'b3', name: '缺作用域', trigger: { type: 'submit' }, conditions: [], actions: [{ type: 'showMessage', message: 'x' }] } }, expectedError: 'REQUIRED_ARGUMENT（scope）' },
    ],
  },
  'behavior.delete': {
    wrong: [
      { summary: '破坏性操作必须等确认。', arguments: { projectId: 'device_mgmt', scope: 'form', formId: 'device_edit', id: 'beh_score_guard', baseRevision: '<revision>', idempotencyKey: 'beh-del-1' }, expectedError: 'confirmation_required' },
    ],
  },
  'rule_code.update': {
    wrong: [
      { summary: '未 lint 的语法错误会直接拒绝写入；先 rule_syntax.lint。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'rule-1', code: 'when $状态 = "停用" -> message("x")' }, expectedError: 'RULE_SYNTAX_INVALID（单等号不是受控运算符）' },
      { summary: 'require/range/validate 的参数是字段引用或数值，不是表达式。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', baseRevision: '<revision>', idempotencyKey: 'rule-2', code: 'before submit -> require($评分 + 1)' }, expectedError: 'RULE_SYNTAX_INVALID' },
    ],
  },
  'rule_syntax.lint': {
    wrong: [
      { summary: '引用不存在的字段会返回静态诊断错误。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', code: 'when $不存在字段 == 1 -> message("x")' }, expectedError: 'RULE_SYNTAX_INVALID（字段引用错误）' },
    ],
  },
  'rule_test.run': {
    wrong: [
      { summary: '语法错误代码在沙箱里同样失败，先修语法。', arguments: { projectId: 'device_mgmt', formId: 'device_edit', code: 'when ->' }, expectedError: '语法错误（sandbox 拒绝执行）' },
    ],
  },
  'rule_verify.model': {
    wrong: [
      { summary: 'formId 不存在时无法建模。', arguments: { projectId: 'device_mgmt', formId: 'device_editx' }, expectedError: 'FORM_NOT_FOUND' },
      { summary: '规则互相触发形成无限循环时返回 acyclic=false 反例，必须修复后再验证。', arguments: { projectId: 'device_mgmt', formId: 'device_edit' }, expectedError: 'passed=false（acyclic=false）' },
    ],
  },
  'rule_reference.search': {
    wrong: [
      { summary: 'query 拼错或过泛时搜不到权威语法，先确认关键词。', arguments: { query: 'setReadonlyy' }, expectedError: '结果为空' },
    ],
  },

  // ─── quality 领域 ──────────────────────────────────────────────────────────
  'mock_data.profile': {
    wrong: [
      { summary: 'tableId/sheetName 必填且必须真实存在。', arguments: { projectId: 'device_mgmt', tableId: 'devicex', sheetName: 'Sheet1' }, expectedError: 'TABLE_NOT_FOUND' },
    ],
  },
  'mock_data.generate': {
    wrong: [
      { summary: 'rowCount 必须是非负有限数。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', rowCount: -1 }, expectedError: 'NUMBER_TOO_SMALL' },
    ],
  },
  'mock_data.preview': {
    wrong: [
      { summary: '与 generate 相同约束：表和 Sheet 必须真实存在。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'SheetX' }, expectedError: 'SHEET_NOT_FOUND' },
    ],
  },
  'mock_data.apply': {
    examples: [
      { summary: '生成并追加 5 行确定性的 Mock 数据', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', rowCount: 5, seed: 42, baseRevision: '<revision>', idempotencyKey: 'mock-1' }, success: { total: 8, applied: { adds: 5 }, generated: 5, seed: 42, revision: '…' }, errors: [{ code: 'PROJECT_REVISION_CONFLICT', message: 'revision 过期，重新 project.get 后再写' }] },
    ],
    wrong: [
      { summary: '写操作必须带最新 baseRevision 与 idempotencyKey。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', rowCount: 5 }, expectedError: 'IDEMPOTENCY_KEY_REQUIRED / PROJECT_REVISION_CONFLICT' },
      { summary: '先 profile/generate/preview 再 apply，避免 schema 不一致。', arguments: { projectId: 'device_mgmt', tableId: 'device', sheetName: 'Sheet1', rowCount: 5, seed: 42, baseRevision: '<revision>', idempotencyKey: 'mock-2' }, expectedError: '数据与 schema 不一致时被拒' },
    ],
  },
  'project_test.generate': {
    wrong: [
      { summary: '缺 idempotencyKey 不会执行。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>' }, expectedError: 'IDEMPOTENCY_KEY_REQUIRED' },
    ],
  },
  'project_test.run': {
    wrong: [
      { summary: 'suiteId 必须来自 project_test.generate 或 history。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'test-run-1', suiteId: 'not_a_suite' }, expectedError: 'TEST_SUITE_NOT_FOUND' },
    ],
  },
  'project_test.history': {
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'project_analysis.run': {
    examples: [
      { summary: '对 device 表运行缺陷预测模板', arguments: { projectId: 'device_mgmt', templateId: 'defect-prediction', tableId: 'device', sheetName: 'Sheet1', baseRevision: '<revision>', idempotencyKey: 'an-1' }, success: { run: { id: '…', status: 'succeeded' }, revision: '…' }, errors: [{ code: 'TEMPLATE_NOT_FOUND', message: '分析模板不存在' }] },
    ],
    wrong: [
      { summary: 'templateId 必须来自模板目录。', arguments: { projectId: 'device_mgmt', templateId: 'guess', tableId: 'device', sheetName: 'Sheet1', baseRevision: '<revision>', idempotencyKey: 'an-2' }, expectedError: 'TEMPLATE_NOT_FOUND' },
    ],
  },
  'project_analysis.list': {
    examples: [
      { summary: '列出全部分析与预测结果', arguments: { projectId: 'device_mgmt' }, success: { runs: [] } },
    ],
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'project_analysis.status': {
    examples: [
      { summary: '检查某个分析结果是否过期', arguments: { projectId: 'device_mgmt', id: '<run id>' }, success: { id: '…', stale: false } },
    ],
    wrong: [
      { summary: 'id 不存在时无法返回状态。', arguments: { projectId: 'device_mgmt', id: 'not_a_run' }, expectedError: 'ANALYSIS_RUN_NOT_FOUND' },
    ],
  },
  'project_analysis.writeback': {
    examples: [
      { summary: '把可用预测结果写回新字段', arguments: { projectId: 'device_mgmt', id: '<run id>', fieldName: '预测状态', baseRevision: '<revision>', idempotencyKey: 'wb-1' }, success: { applied: 100, fieldName: '预测状态', revision: '…' }, errors: [{ code: 'DATA_VERSION_CONFLICT', message: '输入数据已变化，需要重新运行分析' }] },
    ],
    wrong: [
      { summary: '输入数据变化后写回会被拒，需重新运行分析。', arguments: { projectId: 'device_mgmt', id: '<旧 run id>', fieldName: '预测状态', baseRevision: '<revision>', idempotencyKey: 'wb-2' }, expectedError: 'DATA_VERSION_CONFLICT' },
      { summary: 'overwrite=true 覆盖已有字段前必须确认。', arguments: { projectId: 'device_mgmt', id: '<run id>', fieldName: '预测状态', overwrite: true, baseRevision: '<revision>', idempotencyKey: 'wb-3' }, expectedError: 'confirmation_required' },
    ],
  },
  'project_analysis.history': {
    examples: [
      { summary: '读取最近分析运行历史', arguments: { projectId: 'device_mgmt' }, success: { runs: [] } },
    ],
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },

  // ─── delivery 领域 ─────────────────────────────────────────────────────────
  'output.list': {
    examples: [
      { summary: '列出项目输出定义', arguments: { projectId: 'device_mgmt' }, success: { outputs: [] } },
    ],
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'output.get': {
    examples: [
      { summary: '读取输出定义', arguments: { projectId: 'device_mgmt', id: 'report' }, success: { id: 'report', format: 'json' } },
    ],
    wrong: [
      { summary: 'id 不存在时读取失败。', arguments: { projectId: 'device_mgmt', id: 'reportx' }, expectedError: 'OUTPUT_NOT_FOUND' },
    ],
  },
  'output.create': {
    examples: [
      { summary: '创建 JSON 输出定义', arguments: { projectId: 'device_mgmt', id: 'report', baseRevision: '<revision>', idempotencyKey: 'out-1', item: { id: 'report', name: '巡检报告', format: 'json' } }, success: { revision: '…' }, errors: [{ code: 'INVALID_ID', message: 'item.id 不能为空' }] },
    ],
    wrong: [
      { summary: 'item.id 为空无法创建。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'out-2', item: { name: '报告', format: 'json' } }, expectedError: 'INVALID_ID' },
    ],
  },
  'output.update': {
    examples: [
      { summary: '替换输出定义', arguments: { projectId: 'device_mgmt', id: 'report', baseRevision: '<revision>', idempotencyKey: 'out-3', item: { id: 'report', name: '巡检报告 v2', format: 'json' } }, success: { revision: '…' } },
    ],
    wrong: [
      { summary: '旧 baseRevision 会被拒。', arguments: { projectId: 'device_mgmt', id: 'report', baseRevision: '<旧值>', idempotencyKey: 'out-4', item: { id: 'report', name: 'v2' } }, expectedError: 'PROJECT_REVISION_CONFLICT' },
    ],
  },
  'output.delete': {
    examples: [
      { summary: '删除输出定义（需确认）', arguments: { projectId: 'device_mgmt', id: 'report', baseRevision: '<revision>', idempotencyKey: 'out-del-1' }, success: { revision: '…' } },
    ],
    wrong: [
      { summary: '破坏性操作必须等确认。', arguments: { projectId: 'device_mgmt', id: 'report', baseRevision: '<revision>', idempotencyKey: 'out-del-2' }, expectedError: 'confirmation_required' },
    ],
  },
  'output.upsert': {
    examples: [
      { summary: '新增或替换输出定义', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'out-5', item: { id: 'report', name: '巡检报告', format: 'json' } }, success: { revision: '…' } },
    ],
    wrong: [
      { summary: 'item 必须带稳定 id。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'out-6', item: { name: '报告' } }, expectedError: 'INVALID_ID' },
    ],
  },
  'output.generate': {
    examples: [
      { summary: '按输出定义生成项目数据或项目包', arguments: { projectId: 'device_mgmt', id: 'report' }, success: { format: 'json', content: { id: 'device_mgmt' } } },
    ],
    wrong: [
      { summary: 'id 不存在时无法生成。', arguments: { projectId: 'device_mgmt', id: 'reportx' }, expectedError: 'OUTPUT_NOT_FOUND' },
    ],
  },
  'release.get': {
    examples: [
      { summary: '读取发布配置', arguments: { projectId: 'device_mgmt' }, success: { mode: 'design', defaultFormId: 'device_edit' } },
    ],
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'release.update': {
    examples: [
      { summary: '更新默认表单（不切发布模式）', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'rel-1', patch: { defaultFormId: 'device_edit' } }, success: { revision: '…' } },
    ],
    wrong: [
      { summary: 'mode/lastVerifiedAt 只能由 release.apply 更新，release.update 不接受。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'rel-2', patch: { mode: 'use' } }, expectedError: 'INVALID_ARGUMENT' },
    ],
  },
  'release.preview': {
    wrong: [
      { summary: 'projectId 拼错时无法预检。', arguments: { projectId: 'device' }, expectedError: 'PROJECT_NOT_FOUND' },
    ],
  },
  'release.apply': {
    wrong: [
      { summary: 'release.apply 永远不可调用；发布必须停留在 release.preview。', arguments: { projectId: 'device_mgmt', mode: 'use', baseRevision: '<revision>', idempotencyKey: 'rel-3' }, expectedError: '工具不存在 / 门禁拒绝（永远不会注册为可调用工具）' },
    ],
  },

  // ─── template 领域（quality/delivery 边界） ────────────────────────────────
  'template.analyze': {
    wrong: [
      { summary: 'templateId 必须来自操作模板目录。', arguments: { projectId: 'device_mgmt', templateId: 'guess', selection: { tableId: 'device', sheetName: 'Sheet1' } }, expectedError: '模板不存在' },
      { summary: 'selection.tableId 不存在时可行性检查失败。', arguments: { projectId: 'device_mgmt', templateId: 'device-record', selection: { tableId: 'devicex', sheetName: 'Sheet1' } }, expectedError: '选择检查失败（表不存在）' },
    ],
  },
  'template.recommend': {
    wrong: [
      { summary: 'selection 必填，缺省无法评估选择。', arguments: { projectId: 'device_mgmt' }, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'template.plan': {
    wrong: [
      { summary: 'templateId 不存在时无法生成计划。', arguments: { projectId: 'device_mgmt', templateId: 'guess', selection: { tableId: 'device', sheetName: 'Sheet1' } }, expectedError: '模板不存在' },
    ],
  },
  'template.apply': {
    wrong: [
      { summary: 'plan.baseRevision 必须与本次 baseRevision 一致，不能手工改写计划。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'tpl-1', plan: { templateId: 'device-record', baseRevision: '<另一个值>' } }, expectedError: 'PLAN_REVISION_MISMATCH' },
      { summary: '破坏性计划（如覆盖/删除）必须等确认。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'tpl-2', plan: { templateId: 'device-record', summary: { destructive: true } } }, expectedError: 'confirmation_required' },
    ],
  },
  'template.instance.list': {
    examples: [
      { summary: '列出项目内模板实例', arguments: { projectId: 'device_mgmt' }, success: { instances: [] } },
    ],
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'template.instance.detach': {
    examples: [
      { summary: '让实例脱离模板管理（保留生成资源）', arguments: { projectId: 'device_mgmt', id: 'inst-1', baseRevision: '<revision>', idempotencyKey: 'detach-1' }, success: { instance: { id: 'inst-1', status: 'detached' }, revision: '…' } },
    ],
    wrong: [
      { summary: 'id 不存在时无法脱离。', arguments: { projectId: 'device_mgmt', id: 'not_an_instance', baseRevision: '<revision>', idempotencyKey: 'detach-2' }, expectedError: 'TEMPLATE_INSTANCE_NOT_FOUND' },
    ],
  },
  'template.instance.drift': {
    examples: [
      { summary: '检查实例资源是否被手工修改', arguments: { projectId: 'device_mgmt', id: 'inst-1' }, success: { drift: [] } },
    ],
    wrong: [
      { summary: 'id 不存在时无法比较。', arguments: { projectId: 'device_mgmt', id: 'not_an_instance' }, expectedError: 'TEMPLATE_INSTANCE_NOT_FOUND' },
    ],
  },
  'template.instance.regenerate': {
    examples: [
      { summary: '重新生成实例资源（检测到手工修改会阻止）', arguments: { projectId: 'device_mgmt', id: 'inst-1', baseRevision: '<revision>', idempotencyKey: 'reg-1' }, success: { instanceId: 'inst-1', overwritten: false, revision: '…' } },
    ],
    wrong: [
      { summary: '手工修改未确认覆盖时默认阻止。', arguments: { projectId: 'device_mgmt', id: 'inst-1', baseRevision: '<revision>', idempotencyKey: 'reg-2' }, expectedError: '阻止覆盖（手工修改）' },
      { summary: 'overwriteModified=true 必须等确认。', arguments: { projectId: 'device_mgmt', id: 'inst-1', baseRevision: '<revision>', idempotencyKey: 'reg-3', overwriteModified: true }, expectedError: 'confirmation_required' },
    ],
  },
  'template.instance.delete': {
    examples: [
      { summary: '删除模板实例生成物（需确认）', arguments: { projectId: 'device_mgmt', id: 'inst-1', baseRevision: '<revision>', idempotencyKey: 'inst-del-1' }, success: { deleted: true, revision: '…' } },
    ],
    wrong: [
      { summary: '破坏性操作必须等确认。', arguments: { projectId: 'device_mgmt', id: 'inst-1', baseRevision: '<revision>', idempotencyKey: 'inst-del-2' }, expectedError: 'confirmation_required' },
    ],
  },
  'template.instance.upgrade': {
    examples: [
      { summary: '按当前模板版本升级实例', arguments: { projectId: 'device_mgmt', id: 'inst-1', baseRevision: '<revision>', idempotencyKey: 'up-1' }, success: { upgraded: true, fromVersion: 1, toVersion: 2, revision: '…' } },
    ],
    wrong: [
      { summary: '手工漂移且 overwriteModified=true 时必须等确认。', arguments: { projectId: 'device_mgmt', id: 'inst-1', baseRevision: '<revision>', idempotencyKey: 'up-2', overwriteModified: true }, expectedError: 'confirmation_required' },
    ],
  },
  'template.preset.list': {
    examples: [
      { summary: '列出某模板的参数预设', arguments: { projectId: 'device_mgmt', templateId: 'device-record' }, success: { presets: [] } },
    ],
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'template.preset.upsert': {
    examples: [
      { summary: '保存模板参数预设', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'preset-1', preset: { id: 'p1', name: '设备台账默认', templateId: 'device-record', parameters: { remark: '设备台账' } } }, success: { preset: { id: 'p1' }, revision: '…' } },
    ],
    wrong: [
      { summary: '预设必须包含 id、name、templateId。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'preset-2', preset: { name: '缺 ID' } }, expectedError: 'REQUIRED_ARGUMENT' },
      { summary: 'templateId 不存在时拒绝。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'preset-3', preset: { id: 'p2', name: 'x', templateId: 'guess' } }, expectedError: 'TEMPLATE_NOT_FOUND' },
    ],
  },
  'template.preset.delete': {
    examples: [
      { summary: '删除参数预设', arguments: { projectId: 'device_mgmt', id: 'p1', baseRevision: '<revision>', idempotencyKey: 'preset-del-1' }, success: { deleted: true, revision: '…' } },
    ],
    wrong: [
      { summary: 'id 不存在时删除失败。', arguments: { projectId: 'device_mgmt', id: 'not_a_preset', baseRevision: '<revision>', idempotencyKey: 'preset-del-2' }, expectedError: 'TEMPLATE_PRESET_NOT_FOUND' },
    ],
  },
  'template.statistics': {
    examples: [
      { summary: '查看模板使用与失败统计', arguments: { projectId: 'device_mgmt' }, success: { installed: 1, failureReasons: [] } },
    ],
    wrong: [
      { summary: 'projectId 必填。', arguments: {}, expectedError: 'REQUIRED_ARGUMENT' },
    ],
  },
  'template.package.export': {
    examples: [
      { summary: '导出操作模板的纯声明 JSON 包', arguments: { projectId: 'device_mgmt', templateIds: ['device-record'] }, success: { package: { kind: 'formflow-operation-template-package' } } },
    ],
    wrong: [
      { summary: 'templateIds 包含不存在模板时导出失败。', arguments: { projectId: 'device_mgmt', templateIds: ['guess'] }, expectedError: '模板不存在' },
    ],
  },
  'template.package.import': {
    examples: [
      { summary: '导入操作模板包', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'tpl-import-1', package: { kind: 'formflow-operation-template-package', formatVersion: 1, templates: [] } }, success: { imported: [], revision: '…' } },
    ],
    wrong: [
      { summary: 'package 缺少 kind/formatVersion/templates 时格式无效。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'tpl-import-2', package: { templates: [] } }, expectedError: 'INVALID_TEMPLATE_PACKAGE' },
      { summary: 'checksum 与内容不一致会被拒。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'tpl-import-3', package: { kind: 'formflow-operation-template-package', formatVersion: 1, templates: [], checksum: 'wrong' } }, expectedError: 'TEMPLATE_PACKAGE_CHECKSUM_MISMATCH' },
      { summary: '不能覆盖内置模板。', arguments: { projectId: 'device_mgmt', baseRevision: '<revision>', idempotencyKey: 'tpl-import-4', package: { kind: 'formflow-operation-template-package', formatVersion: 1, templates: [{ id: '<内置模板 id>' }] } }, expectedError: 'BUILT_IN_TEMPLATE_CONFLICT' },
    ],
  },
};
