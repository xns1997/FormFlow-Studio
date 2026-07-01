// proj_new 项目导入脚本
// 在浏览器控制台或通过项目管理界面导入 project.json
//
// 使用方式：
// 1. 打开 FormFlow Studio
// 2. 点击"导入项目"按钮
// 3. 选择 proj_new/project.json 文件
//
// 或在代码中调用：
//   import { importProjectFile } from './src/project/manager';
//   const file = new File([await fetch('/proj_new/project.json').then(r => r.blob())], 'project.json');
//   const project = await importProjectFile(file);

export const PROJECT_INFO = {
  name: '示例项目 - 数据分析与表单',
  workflows: [
    {
      id: 'wf_data_processing',
      name: '流程1: 数据清洗与聚合',
      description: '筛选 → 排序 → 类型转换 → 缺失值处理 → 分组聚合 → 导出',
      nodes: 8,
      edges: 7,
    },
    {
      id: 'wf_regression',
      name: '流程2: 回归分析',
      description: '数据源 → 描述性统计 → 相关性分析 → 线性回归',
      nodes: 6,
      edges: 5,
    },
    {
      id: 'wf_chart',
      name: '流程3: 图表绘制',
      description: '数据源 → 分组 → 柱状图/饼图/折线图',
      nodes: 7,
      edges: 6,
    },
    {
      id: 'wf_form_entry',
      name: '流程4: 信息录入与修改',
      description: '表单校验 → 条件判断 → 设值 → 计算 → 提交',
      nodes: 9,
      edges: 9,
    },
  ],
  dataSheets: [
    { name: '销售数据.xlsx', sheet: '销售记录', rows: 20, cols: 6 },
    { name: '员工信息.xlsx', sheet: '员工档案', rows: 10, cols: 7 },
  ],
  designs: [
    { name: '员工信息录入表单', components: 11 },
  ],
};
