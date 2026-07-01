// 国际化字符串常量 — 提取硬编码中文
// 后续可替换为 i18n 库（react-intl / i18next）

export const STR = {
  // 通用
  confirm: '确认',
  cancel: '取消',
  save: '保存',
  delete: '删除',
  close: '关闭',
  search: '搜索',
  loading: '加载中…',
  error: '错误',
  success: '成功',

  // 项目列表
  allProjects: '所有项目',
  createProject: '新建项目',
  importProject: '导入项目',
  noProjects: '还没有项目',
  noProjectsHint: '点击「新建项目」开始，或「导入项目」加载已有项目',

  // 数据预览
  dataTable: '数据表',
  fieldInfo: '字段信息',
  upload: '上传',
  describe: '数据概览',
  config: '配置',

  // 流程编排
  flowCanvas: '流程编排',
  runFlow: '▶ 运行流程',
  running: '执行中…',
  stepDebug: '⏭ 单步',
  reset: '重置',
  saveWorkflow: '保存流程',
  loadWorkflow: '加载流程…',
  searchNodes: '搜索节点',
  nodePalette: '节点面板',
  noNodes: '暂无节点',
  addNode: '添加节点',

  // 表单设计
  formDesigner: '表单设计',
  preview: '预览',
  design: '设计',
  properties: '属性',
  events: '事件',
  layout: '布局',
  deleteComponent: '删除',
  clickToEdit: '点击画布上的控件编辑属性',

  // 测试运行
  testRun: '测试运行',
  prevRow: '上一行',
  nextRow: '下一行',
  submit: '提交',
  export_: '导出…',
  runtimeState: '运行时状态',
  changeLog: '变更记录',
  behaviorLog: '行为日志',
  errorCheck: '错误检查',
  noChanges: '暂无变更',
  noData: '暂无数据表',
  selectSheet: '选择左侧数据表开始测试',

  // 行为定义
  behaviorDef: '行为定义',
  newScript: '新建',
  noScripts: '暂无脚本',
  scriptName: '脚本名称',

  // 范围选择器
  selectRange: '选择数据范围',
  workbook: '工作簿',
  firstRowHeader: '首行标题',
  autoDetect: '自动检测',
  yes: '是',
  no: '否',
  clear: '✕ 清除',
  row: '行',
  col: '列',
  entireRow: '整行',
  entireCol: '整列',
  multiRange: '多区域',

  // 输出预览
  outputPreview: '输出预览',
  rawData: '原始数据',
  copy: '复制',
  copied: '已复制',
  download: '下载',
  noDataToShow: '没有可显示的数据',

  // 节点
  port: '端口',
  config_: '配置',
  output: '输出',
  connected: '已连接',
  runToHere: '从最上游运行到此节点',

  // 设置
  settings: '设置',
} as const;

export type StringKey = keyof typeof STR;
