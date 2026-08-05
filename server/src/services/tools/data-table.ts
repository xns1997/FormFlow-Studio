/**
 * Dedicated one-step table creation tool.
 *
 * The generic data_source.create is flexible but model agents repeatedly trip
 * on its config.shape (keyFields placement, enum definitions). data_table.create
 * accepts a flat, copy-ready shape and assembles the underlying project source
 * in one call: columns + keyFields + optional seeded rows.
 */
import { assertRevision, requireProject, tableFromInput, toolError } from '../project-authoring';
import { dataColumnSchema } from '../tool-shared';
import { normalizeColumnType } from '../../../../shared/formflow-core/columnTypes';
import type { RegisterFn, ToolHelpers } from './types';

/** 注册数据表域工具（数据源/Sheet/行操作）。 */
export function registerDataTableTools(register: RegisterFn, h: ToolHelpers) {
  const { projectId } = h;
  register({
    name: 'data_table.create',
    title: '创建数据表',
    description: '一步创建数据表：定义列（name/type/enum）、主键（keyFields），可选预置业务数据（rows）；内部自动配置 Sheet 主键与列枚举。可编辑表必须提供 keyFields（缺省时自动选编号/id 类列）。',
    inputSchema: h.schema(['projectId', 'id', 'baseRevision', 'idempotencyKey'], {
      projectId: h.string,
      id: h.string,
      name: h.string,
      baseRevision: h.string,
      idempotencyKey: h.string,
      sheetName: h.string,
      readOnly: h.boolean,
      columns: { type: 'array', items: dataColumnSchema, description: '列定义：name（列名）、type（string/number/boolean/date/enum，支持别名）、enum（枚举值）、nullable。' },
      keyFields: { type: 'array', items: h.string, description: '主键列名，必须与 columns.name 一致；可编辑表必填。' },
      rows: { type: 'array', items: { type: 'object', additionalProperties: true }, description: '可选预置业务记录；字段名与列名一致。' },
    }),
    risk: 'write',
    requiredAccess: 'edit',
    examples: [{
      summary: '一步创建含列/主键/枚举/示例数据的表',
      arguments: {
        projectId: 'device_mgmt',
        id: 'device',
        baseRevision: '<revision>',
        idempotencyKey: 'tbl-1',
        columns: [
          { name: '编号', type: 'string' },
          { name: '名称', type: 'string' },
          { name: '类型', type: 'enum', enum: ['机床', '泵', '阀门'] },
          { name: '状态', type: 'enum', enum: ['正常', '待检', '停用'] },
          { name: '评分', type: 'number' },
        ],
        keyFields: ['编号'],
        rows: [{ 编号: 'D-001', 名称: '机床A', 类型: '机床', 状态: '正常', 评分: 88 }],
      },
      success: { revision: '5b4813ff80765e2e4cf…（最新项目 revision）' },
      errors: [
        { code: 'TABLE_EXISTS', message: '数据表已存在；请改用其他 id 或读取后增量修改。' },
        { code: 'MISSING_KEY', message: '可编辑表必须配置主键（keyFields）。' },
      ],
    }],
    handler: (input, context) => {
      const project = requireProject(projectId(input, context));
      assertRevision(project, input.baseRevision);
      if ((project.srcTable || []).some((item: any) => item.id === input.id)) throw toolError('TABLE_EXISTS', `数据表 ${input.id} 已存在`);
      const columns = (input.columns || []).map((column: any) => {
        const type = String(column.type || 'string').toLowerCase();
        return { ...column, type: normalizeColumnType(type) };
      });
      const keyFields = Array.isArray(input.keyFields) ? input.keyFields.map(String) : [];
      if (input.readOnly !== true && !keyFields.length) {
        const candidate = columns.find((column: any) => /编号|id|code|号/i.test(String(column.name || ''))) || columns[0];
        if (candidate) keyFields.push(String(candidate.name));
      }
      const built = tableFromInput({
        ...input,
        tenantId: context.tenantId,
        config: { columns, keyFields, readOnly: Boolean(input.readOnly) },
        rows: input.rows,
        id: input.id,
        projectId: projectId(input, context),
      });
      project.srcTable.push(built.table);
      project.config.updatedAt = new Date().toISOString();
      return h.commitProject(project, built.sourceFiles);
    },
  });
}
