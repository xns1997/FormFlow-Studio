import type { DocDomain, DocEntry } from './catalog';

export type DocScreenshotEntry = Pick<DocEntry, 'title' | 'domain'> & Partial<Pick<DocEntry, 'id' | 'kind' | 'blocks'>>;

export interface DocScreenshotDescriptor {
  src: string;
  label: string;
}

export type LegacyDocSectionId = 'overview' | 'behavior' | 'form-design' | 'flow-nodes' | 'backend';

/** 旧文档区块 → 新文档域映射。 */
export const LEGACY_DOC_DOMAINS: Record<LegacyDocSectionId, DocDomain> = {
  overview: 'getting-started',
  behavior: 'behavior',
  'form-design': 'controls',
  'flow-nodes': 'nodes',
  backend: 'api',
};

/** 文档域 → 截图描述。 */
export const DOC_SCREENSHOTS: Record<DocDomain, DocScreenshotDescriptor> = {
  'getting-started': { src: '/docs/screenshots/project-create.png', label: '创建项目向导' },
  data: { src: '/docs/screenshots/data-workspace.png', label: '数据工作区' },
  forms: { src: '/docs/screenshots/form-designer.png', label: '表单设计器' },
  behavior: { src: '/docs/screenshots/behavior-editor.png', label: '行为编辑器' },
  workflows: { src: '/docs/screenshots/workflow-canvas.png', label: '流程画布' },
  templates: { src: '/docs/screenshots/template-center.png', label: '操作模板中心' },
  quality: { src: '/docs/screenshots/quality-center.png', label: '数据质量中心' },
  delivery: { src: '/docs/screenshots/delivery-usage.png', label: '项目运行与数据预览' },
  controls: { src: '/docs/screenshots/form-designer.png', label: '表单设计器与控件库' },
  nodes: { src: '/docs/screenshots/workflow-canvas.png', label: '流程画布与节点配置' },
  events: { src: '/docs/screenshots/behavior-editor.png', label: '行为与事件配置' },
  api: { src: '/docs/screenshots/api-settings.png', label: 'Swagger API 参考' },
};

/** 特殊截图（登录/引导等非域截图）。 */
export const DOC_SPECIAL_SCREENSHOTS = {
  'project-create': { src: '/docs/screenshots/project-create.png', label: '创建项目向导' },
  'project-details': { src: '/docs/screenshots/project-details.png', label: '项目基础信息' },
  'template-config': { src: '/docs/screenshots/template-config.png', label: '模板配置向导' },
  'test-overview': { src: '/docs/screenshots/test-overview.png', label: '自动测试总览' },
  'release-check': { src: '/docs/screenshots/release-check.png', label: '发布门禁检查' },
} satisfies Record<string, DocScreenshotDescriptor>;

/** 获取文档条目截图描述。 */
export function getDocScreenshot(entry: DocScreenshotEntry): DocScreenshotDescriptor {
  return DOC_SCREENSHOTS[entry.domain];
}
