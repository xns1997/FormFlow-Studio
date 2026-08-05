import { backendDocs, behaviorEventDocs, behaviorTopicDocs, formDesignDocs, overviewDocs } from './behaviorDocs';

export type WorkspaceTab = 'data' | 'template' | 'canvas' | 'designer' | 'behavior' | 'test' | 'settings';
export type ProjectSettingsSection = 'general' | 'versions' | 'behavior' | 'publish' | 'workflow';
export type SystemSettingsSection = 'general' | 'appearance' | 'storage' | 'editor' | 'workflow' | 'ai' | 'experts' | 'experiments';
export type DocSourcePage = 'workspace' | 'settings';
export type LegacyDocSection = 'overview' | 'behavior' | 'form-design' | 'flow-nodes' | 'backend';

function withDocSource(path: string, source?: {
  fromProject?: string;
  fromPage?: DocSourcePage;
  fromTab?: string;
}) {
  if (!source) return path;
  const search = new URLSearchParams();
  if (source.fromProject) search.set('fromProject', source.fromProject);
  if (source.fromPage) search.set('fromPage', source.fromPage);
  if (source.fromTab) search.set('fromTab', source.fromTab);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

const TOPIC_BEHAVIOR_SLUGS = new Set(behaviorTopicDocs.map((doc) => doc.slug));
const EVENT_SLUGS = new Set(behaviorEventDocs.map((doc) => doc.slug));
const OVERVIEW_SLUGS = new Set(overviewDocs.map((doc) => doc.slug));
const CONTROL_SLUGS = new Set(formDesignDocs.map((doc) => doc.slug));
const API_SLUGS = new Set(backendDocs.map((doc) => doc.slug));

/** 解析文档规范路径。 */
export function resolveDocCanonicalPath(slug?: string) {
  if (!slug) return '/docs';
  if (TOPIC_BEHAVIOR_SLUGS.has(slug)) return `/docs/reference/behavior/${encodeURIComponent(slug)}`;
  if (EVENT_SLUGS.has(slug)) return `/docs/reference/events/${encodeURIComponent(slug)}`;
  if (OVERVIEW_SLUGS.has(slug)) return `/docs/reference/getting-started/${encodeURIComponent(slug)}`;
  if (CONTROL_SLUGS.has(slug)) return `/docs/reference/controls/${encodeURIComponent(slug)}`;
  if (API_SLUGS.has(slug)) return `/docs/reference/api/${encodeURIComponent(slug)}`;
  return `/docs?q=${encodeURIComponent(slug)}`;
}

/** 旧文档路径 → 新规范路径（含重定向）。 */
export function resolveLegacyDocPath(section: LegacyDocSection, slug?: string) {
  if (!slug) {
    const domain = section === 'overview'
      ? 'getting-started'
      : section === 'form-design'
        ? 'controls'
        : section === 'flow-nodes'
          ? 'nodes'
          : section === 'backend'
            ? 'api'
            : 'events';
    return `/docs?domain=${encodeURIComponent(domain)}`;
  }
  if (section === 'behavior') {
    if (TOPIC_BEHAVIOR_SLUGS.has(slug)) return `/docs/reference/behavior/${encodeURIComponent(slug)}`;
    if (EVENT_SLUGS.has(slug)) return `/docs/reference/events/${encodeURIComponent(slug)}`;
    return `/docs?domain=behavior&q=${encodeURIComponent(slug)}`;
  }
  if (section === 'overview') {
    if (OVERVIEW_SLUGS.has(slug)) return `/docs/reference/getting-started/${encodeURIComponent(slug)}`;
    return `/docs?domain=getting-started&q=${encodeURIComponent(slug)}`;
  }
  if (section === 'form-design') {
    if (CONTROL_SLUGS.has(slug)) return `/docs/reference/controls/${encodeURIComponent(slug)}`;
    return `/docs?domain=controls&q=${encodeURIComponent(slug)}`;
  }
  if (section === 'backend') {
    if (API_SLUGS.has(slug)) return `/docs/reference/api/${encodeURIComponent(slug)}`;
    return `/docs?domain=api&q=${encodeURIComponent(slug)}`;
  }
  return `/docs?domain=nodes&q=${encodeURIComponent(slug)}`;
}

/** 项目列表页路径。 */
export function buildProjectsPath() {
  return '/projects';
}

/** 项目详情页路径。 */
export function buildProjectPath(projectId: string) {
  return `/projects/${projectId}`;
}

/** 项目编辑器路径。 */
export function buildEditorPath(projectId: string) {
  return `/projects/${projectId}/editor`;
}

/** 工作区路径（可带页签）。 */
export function buildWorkspacePath(projectId: string, tab?: WorkspaceTab) {
  if (tab === 'test') return `/projects/${projectId}/usage`;
  const modes: Record<Exclude<WorkspaceTab, 'test'>, string> = {
    data: 'data', template: 'template', canvas: 'flow', designer: 'design', behavior: 'behavior', settings: 'settings',
  };
  return `/projects/${projectId}/editor?mode=${modes[tab || 'data']}`;
}

/** 项目设置路径（可带区块）。 */
export function buildProjectSettingsPath(projectId: string, section?: ProjectSettingsSection) {
  return section ? `/projects/${projectId}/settings/${section}` : `/projects/${projectId}/settings`;
}

/** 文档页路径（带来源追踪参数）。 */
export function buildDocsPath(slug?: string, source?: {
  fromProject?: string;
  fromPage?: DocSourcePage;
  fromTab?: string;
}) {
  return withDocSource(resolveDocCanonicalPath(slug), source);
}

/** 文档区块路径。 */
export function buildDocsSectionPath(sectionId: string, slug?: string, source?: {
  fromProject?: string;
  fromPage?: DocSourcePage;
  fromTab?: string;
}) {
  const base = slug ? `/docs/${sectionId}/${slug}` : `/docs/${sectionId}`;
  return withDocSource(base, source);
}

/** 用量页路径。 */
export function buildUsagePath(projectId: string) {
  return `/projects/${projectId}/usage`;
}

/** 系统设置路径。 */
export function buildSystemSettingsPath(section?: SystemSettingsSection) {
  return section ? `/settings/${section}` : '/settings';
}
