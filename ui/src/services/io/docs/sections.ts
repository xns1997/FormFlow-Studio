export interface DocSection {
  id: string;
  title: string;
  summary: string;
  icon: string;
  color: string;
  path: string;
  count: number;
  tags: string[];
}

export const docSections: DocSection[] = [
  {
    id: 'overview',
    title: '梗概',
    summary: '产品介绍、核心概念、快速入门指南',
    icon: 'docs',
    color: '#6366f1',
    path: '/docs/overview',
    count: 3,
    tags: ['入门', '概念', '快速开始'],
  },
  {
    id: 'behavior',
    title: '行为',
    summary: '脚本事件、控件事件、上下文 API、联动规则',
    icon: 'behavior',
    color: '#2563eb',
    path: '/docs/behavior',
    count: 31,
    tags: ['事件', '脚本', '联动', 'API'],
  },
  {
    id: 'form-design',
    title: '表单设计',
    summary: '控件类型、属性配置、数据绑定、样式定制',
    icon: 'designer',
    color: '#7c3aed',
    path: '/docs/form-design',
    count: 26,
    tags: ['控件', '属性', '绑定', '布局'],
  },
  {
    id: 'flow-nodes',
    title: '流程节点',
    summary: '节点分类、端口类型、数据处理、行为节点',
    icon: 'canvas',
    color: '#0f766e',
    path: '/docs/flow-nodes',
    count: 8,
    tags: ['节点', '流程', '数据', 'Excel'],
  },
  {
    id: 'backend',
    title: '后端',
    summary: 'RESTful API、数据存储、文件管理、机器学习',
    icon: 'settings',
    color: '#ea580c',
    path: '/docs/backend',
    count: 9,
    tags: ['API', 'REST', '存储', 'ML'],
  },
];

export function getDocSection(id: string): DocSection | undefined {
  return docSections.find((s) => s.id === id);
}

export function getDocSectionByPath(path: string): DocSection | undefined {
  return docSections.find((s) => s.path === path);
}
