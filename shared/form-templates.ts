/**
 * Shared form template metadata.
 *
 * The UI designer and the server-side catalog / form tools share this single
 * source of truth so a template chosen through `catalog.form_templates.*`
 * always matches what the designer offers. The descriptors are declarative:
 * layout generation stays in the UI (`ui/src/designer/designTemplates.ts`)
 * and in the server's `generatedForm`, which only reads `key` / `formMode`.
 */

/** 表单模板默认模式。 */
export type FormTemplateMode = 'create' | 'edit' | 'detail' | 'lookup-edit';
/** 内置表单模板 ID。 */
export type FormTemplateId = 'blank' | 'basic-entry' | 'lookup-edit' | 'master-detail';

/** 表单模板描述：UI 设计器与服务端 catalog 共享的唯一事实源。 */
export interface FormTemplateDescriptor {
  key: FormTemplateId;
  label: string;
  description: string;
  /** 模板默认表单模式；`form.create` / `form.generate_from_table` 在未显式传 mode 时使用。 */
  formMode: FormTemplateMode;
  /** 是否支持通过 `form.generate_from_table` 从数据表生成骨架。 */
  scaffoldFromTable: boolean;
  /** 是否要求先声明数据关系（主从模板需要 relation + 主从表）。 */
  requiresRelation: boolean;
  /** 该模板可用的生成选项（供调用方与模型参考，不是执行 schema）。 */
  options: string[];
}

/** 全部内置表单模板（blank / basic-entry / lookup-edit / master-detail）。 */
export const FORM_TEMPLATES: FormTemplateDescriptor[] = [
  {
    key: 'blank',
    label: '空白表单',
    description: '从空白设计开始：先绑定数据表，再按需添加控件与操作区。',
    formMode: 'create',
    scaffoldFromTable: true,
    requiresRelation: false,
    options: ['selectedFields', 'hiddenFields', 'readonlyFields', 'columns', 'labelWidth', 'density', 'includeSave', 'includeReset', 'successMessage', 'failureMessage', 'emptyStateMessage'],
  },
  {
    key: 'basic-entry',
    label: '基础录入表单',
    description: '按真实字段生成录入布局与保存/重置操作区。',
    formMode: 'create',
    scaffoldFromTable: true,
    requiresRelation: false,
    options: ['selectedFields', 'columns', 'labelWidth', 'density', 'includeSave', 'includeReset', 'saveLabel', 'successMessage', 'failureMessage'],
  },
  {
    key: 'lookup-edit',
    label: '查询修改表单',
    description: '按真实字段生成查询区、编辑区和保存区，支持分页与冲突策略。',
    formMode: 'lookup-edit',
    scaffoldFromTable: true,
    requiresRelation: false,
    options: ['queryFields', 'editableFields', 'displayFields', 'selectedFields', 'columns', 'pageSize', 'defaultExpanded', 'queryLimit', 'autoQueryOnLoad', 'queryMode', 'dirtyOnly', 'refetchAfterSave', 'conflictPolicy', 'existingPolicy', 'saveLabel', 'lookupLabel'],
  },
  {
    key: 'master-detail',
    label: '主从详情表单',
    description: '为已声明关系预留主表列表与详情编辑区。',
    formMode: 'edit',
    scaffoldFromTable: true,
    requiresRelation: true,
    options: ['masterFields', 'detailFields', 'relation', 'detailTableId', 'detailSheetName', 'detailTitle', 'detailRows', 'detailEditableMode', 'allowEmptyDetails', 'duplicateDetailPolicy', 'columns'],
  },
];

/** 按 key 查找模板描述，未找到返回 undefined。 */
export function getFormTemplate(key: string): FormTemplateDescriptor | undefined {
  return FORM_TEMPLATES.find((template) => template.key === key);
}
