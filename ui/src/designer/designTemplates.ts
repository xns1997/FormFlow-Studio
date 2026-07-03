import type { DesignComponent, DesignFile, FormMode } from '../project/types';
import { createDesignFile } from '../project/types';

export interface DesignTemplateDefinition {
  key: string;
  label: string;
  description: string;
  formMode: FormMode;
}

export const DESIGN_TEMPLATES: DesignTemplateDefinition[] = [
  { key: 'blank', label: '空白表单', description: '从空白设计开始', formMode: 'create' },
  { key: 'basic-entry', label: '基础录入表单', description: '姓名、分类、说明和保存操作', formMode: 'create' },
  { key: 'lookup-edit', label: '查询修改表单', description: '查询区 + 编辑区 + 保存区', formMode: 'lookup-edit' },
  { key: 'master-detail', label: '主从详情表单', description: '列表选择后编辑详情', formMode: 'edit' },
];

function component(
  id: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  props: Record<string, unknown>,
  parentId = 'form_root',
): DesignComponent {
  return { id, type, x, y, width, height, props, parentId, zIndex: 2 };
}

function createFormRoot(title: string, subtitle: string, children: string[]): DesignComponent {
  return {
    id: 'form_root',
    type: 'form',
    x: 40,
    y: 40,
    width: 980,
    height: 720,
    zIndex: 0,
    children,
    props: {
      title,
      subtitle,
      background: '#f2f2f7',
      padding: 20,
      showFooter: false,
    },
  };
}

export function createDesignFromTemplate(key: string, index = 1): DesignFile {
  if (key === 'blank') return createDesignFile(`设计 ${index}`, { formMode: 'create', templateKey: key });

  if (key === 'basic-entry') {
    const design = createDesignFile(`基础录入 ${index}`, { formMode: 'create', templateKey: key });
    design.components = [
      createFormRoot('基础录入表单', '适合新建和提交基础资料。', ['input_name', 'select_category', 'textarea_remark', 'button_save']),
      component('input_name', 'input', 100, 150, 300, 72, { label: '名称', name: 'name', placeholder: '请输入名称', required: true }),
      component('select_category', 'select', 440, 150, 300, 72, { label: '分类', name: 'category', placeholder: '请选择分类', options: ['A 类', 'B 类', 'C 类'] }),
      component('textarea_remark', 'textarea', 100, 250, 640, 120, { label: '说明', name: 'remark', placeholder: '请输入说明' }),
      component('button_save', 'button', 560, 400, 180, 52, { label: '保存', name: 'saveEntry', icon: '💾' }),
    ];
    return design;
  }

  if (key === 'lookup-edit') {
    const design = createDesignFile(`查询修改 ${index}`, { formMode: 'lookup-edit', templateKey: key });
    design.components = [
      createFormRoot('查询修改表单', '先查询，再修改详情并保存。', ['lookup_keyword', 'button_lookup', 'detail_name', 'detail_status', 'detail_remark', 'button_update']),
      component('lookup_keyword', 'input', 100, 150, 420, 72, { label: '查询关键字', name: 'keyword', placeholder: '请输入编号或名称' }),
      component('button_lookup', 'button', 560, 164, 180, 52, { label: '查找记录', name: 'lookupRecord', icon: '🔍' }),
      component('detail_name', 'input', 100, 300, 300, 72, { label: '名称', name: 'detailName', required: true }),
      component('detail_status', 'select', 440, 300, 300, 72, { label: '状态', name: 'detailStatus', options: ['启用', '停用'] }),
      component('detail_remark', 'textarea', 100, 400, 640, 120, { label: '备注', name: 'detailRemark', placeholder: '可修改的补充说明' }),
      component('button_update', 'button', 560, 550, 180, 52, { label: '保存修改', name: 'saveLookupEdit', icon: '💾', disabled: true }),
    ];
    return design;
  }

  const design = createDesignFile(`主从详情 ${index}`, { formMode: 'edit', templateKey: key });
  design.components = [
    createFormRoot('主从详情表单', '左侧选中记录，右侧查看或编辑详情。', ['table_master', 'detail_name', 'detail_owner', 'detail_status', 'button_save_detail']),
    component('table_master', 'table', 80, 150, 360, 420, { label: '记录列表', name: 'masterTable' }),
    component('detail_name', 'input', 500, 170, 320, 72, { label: '详情名称', name: 'detailName', readonly: true }),
    component('detail_owner', 'input', 500, 270, 320, 72, { label: '负责人', name: 'detailOwner' }),
    component('detail_status', 'select', 500, 370, 320, 72, { label: '状态', name: 'detailStatus', options: ['草稿', '处理中', '完成'] }),
    component('button_save_detail', 'button', 640, 490, 180, 52, { label: '保存详情', name: 'saveDetail', icon: '💾' }),
  ];
  return design;
}
