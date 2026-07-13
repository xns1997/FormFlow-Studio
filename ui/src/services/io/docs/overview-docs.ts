import type { BehaviorTopicDocEntry } from './types';

export const overviewDocs: BehaviorTopicDocEntry[] = [
  {
    id: 'overview:what-is-formflow',
    slug: 'what-is-formflow',
    title: '什么是 FormFlow',
    summary: 'FormFlow 是一个基于 Excel 的表单编排框架，将电子表格的数据能力与表单的交互能力结合。',
    sections: [
      {
        title: '核心理念',
        body: 'FormFlow 将 Excel 数据表作为数据源，通过可视化设计器拖拽生成表单，再通过行为脚本和流程引擎实现业务逻辑。三者协同工作，无需编写后端代码即可构建完整的数据录入和处理应用。',
      },
      {
        title: '核心概念',
        fields: [
          { name: '数据表 (SrcTable)', type: '数据层', description: '从 Excel/CSV/JSON 导入的结构化数据，作为表单的数据源和存储后端。' },
          { name: '表单 (Form)', type: '交互层', description: '由控件组成的可视化界面，支持拖拽设计、数据绑定、联动规则。' },
          { name: '行为 (Behavior)', type: '逻辑层', description: '事件驱动的脚本系统，在表单生命周期各阶段执行自定义逻辑。' },
          { name: '流程 (Workflow)', type: '处理层', description: '由节点组成的有向图，实现数据过滤、转换、聚合等复杂处理。' },
        ],
      },
      {
        title: '典型使用场景',
        body: '1. 数据录入：员工信息、客户资料、订单录入\n2. 数据查询：工单查询、库存查询、报表查看\n3. 审批流程：请假审批、报销审批、合同审批\n4. 数据分析：销售统计、绩效分析、趋势预测',
      },
      {
        title: '技术栈',
        body: '前端：React + TypeScript + Ant Design + Vite\n后端：Node.js + Express + SheetJS\n数据：Excel/CSV/JSON 文件 + SQLite\n流程：自研节点引擎 + Python ML 集成',
      },
    ],
  },
  {
    id: 'overview:quick-start',
    slug: 'quick-start',
    title: '快速入门',
    summary: '5 分钟创建你的第一个表单应用：导入数据、设计表单、添加行为、测试运行。',
    sections: [
      {
        title: '第一步：创建项目',
        body: '点击首页「新建项目」，输入项目名称和描述。项目是所有表单、数据、流程的容器。',
      },
      {
        title: '第二步：导入数据',
        body: '在工作区的「数据预览」标签页，上传 Excel/CSV/JSON 文件。系统会自动解析表结构、列类型和数据样本。',
      },
      {
        title: '第三步：设计表单',
        body: '切换到「表单设计」标签页，从左侧工具箱拖拽控件到画布。通过右侧属性面板配置控件的数据绑定、校验规则和样式。',
      },
      {
        title: '第四步：添加行为',
        body: '切换到「行为定义」标签页，为表单事件（如字段变更、提交）编写脚本。脚本可以读写字段值、控制显隐、调用流程。',
      },
      {
        title: '第五步：测试运行',
        body: '切换到「测试运行」标签页，预览表单效果并测试行为逻辑。支持实时查看脚本日志和数据变化。',
      },
      {
        title: '快速上手示例',
        examples: [
          { title: '创建员工录入表单', code: '1. 创建项目：名称 "员工管理"\n2. 导入数据：上传员工信息.xlsx\n3. 设计表单：拖入文本输入（姓名）、数字输入（工号）、下拉选择（部门）\n4. 添加行为：onFormLoad 设置默认状态为"在职"\n5. 测试运行：填写表单并提交' },
        ],
      },
    ],
  },
  {
    id: 'overview:project-structure',
    slug: 'project-structure',
    title: '项目结构',
    summary: '了解 .formflow 项目包的文件组织方式和数据格式。',
    sections: [
      {
        title: '目录结构',
        fields: [
          { name: 'project.json', type: '配置', description: '项目元数据：ID、名称、描述、版本、作者、标签。' },
          { name: 'forms/', type: '表单', description: '表单定义文件，每个表单包含设计文件和行为文件。' },
          { name: 'data/', type: '数据', description: '数据表元数据和行为文件，实际数据文件独立存储。' },
          { name: 'workflows/', type: '流程', description: '流程定义文件，包含节点和边的有向图。' },
          { name: 'behaviors/', type: '行为', description: '全局行为文件，跨表单共享的脚本逻辑。' },
          { name: 'outputs/', type: '输出', description: '输出文件配置，定义数据导出格式。' },
        ],
      },
      {
        title: '数据格式',
        body: '所有配置文件使用 JSON 格式。数据文件支持 .xlsx、.xls、.csv、.json、.sqlite 五种格式。项目包以 .formflow 为扩展名。',
      },
    ],
  },
  {
    id: 'overview:faq',
    slug: 'faq',
    title: '常见问题',
    summary: '解答使用 FormFlow 过程中的常见问题。',
    sections: [
      {
        title: 'Q: 如何实现字段联动？',
        body: 'A: 在「行为定义」标签页，为字段的 onFieldChange 事件编写脚本。例如：当部门字段变化时，显示或隐藏技术栈字段：\n\nif (field === "部门") {\n  await setVisible("技术栈", value === "技术部");\n}',
      },
      {
        title: 'Q: 如何在提交前校验数据？',
        body: 'A: 使用 onSubmit 或 onBeforeSubmit 事件。推荐使用 requireFields 批量校验：\n\nconst check = await ctx.requireFields(["姓名", "手机号"]);\nif (!check.valid) {\n  showMessage("请填写必填项", "error");\n  return;\n}',
      },
      {
        title: 'Q: 如何实现级联选择？',
        body: 'A: 为父级字段的 onFieldChange 事件编写脚本，动态设置子级字段的选项。例如省份-城市联动：\n\nconst cityOptions = {\n  "广东": ["广州", "深圳"],\n  "浙江": ["杭州", "宁波"]\n};\nconst options = cityOptions[value] || [];\nawait setValue("城市", options[0] || "");',
      },
      {
        title: 'Q: 如何调用流程？',
        body: 'A: 在按钮的 onClick 事件中使用 runConfiguredWorkflow()。流程需要先在「流程编排」标签页设计好，并绑定到按钮事件。',
      },
      {
        title: 'Q: 如何导出数据？',
        body: 'A: 使用流程中的「数据导出」节点，支持导出为 Excel、CSV、JSON 格式。也可以在使用模式中直接导出当前数据。',
      },
    ],
  },
];
