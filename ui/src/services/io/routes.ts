export type WorkspaceTab = 'data' | 'template' | 'canvas' | 'designer' | 'behavior' | 'test' | 'settings';
export type ProjectSettingsSection = 'general' | 'versions' | 'behavior' | 'publish';
export type SystemSettingsSection = 'general' | 'storage' | 'editor' | 'ai' | 'experts' | 'experiments';
export type DocSourcePage = 'workspace' | 'settings';

export function buildProjectsPath() {
  return '/projects';
}

export function buildProjectPath(projectId: string) {
  return `/projects/${projectId}`;
}

export function buildEditorPath(projectId: string) {
  return `/projects/${projectId}/editor`;
}

export function buildWorkspacePath(projectId: string, tab?: WorkspaceTab) {
  if (tab === 'test') return `/projects/${projectId}/usage`;
  const modes: Record<Exclude<WorkspaceTab, 'test'>, string> = {
    data: 'data', template: 'template', canvas: 'flow', designer: 'design', behavior: 'behavior', settings: 'settings',
  };
  return `/projects/${projectId}/editor?mode=${modes[tab || 'data']}`;
}

export function buildProjectSettingsPath(projectId: string, section?: ProjectSettingsSection) {
  return section ? `/projects/${projectId}/settings/${section}` : `/projects/${projectId}/settings`;
}

export function buildDocsPath(slug?: string, source?: {
  fromProject?: string;
  fromPage?: DocSourcePage;
  fromTab?: string;
}) {
  const base = slug ? `/docs/${slug}` : '/docs';
  if (!source) return base;
  const search = new URLSearchParams();
  if (source.fromProject) search.set('fromProject', source.fromProject);
  if (source.fromPage) search.set('fromPage', source.fromPage);
  if (source.fromTab) search.set('fromTab', source.fromTab);
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

export function buildDocsSectionPath(sectionId: string, slug?: string, source?: {
  fromProject?: string;
  fromPage?: DocSourcePage;
  fromTab?: string;
}) {
  const base = slug ? `/docs/${sectionId}/${slug}` : `/docs/${sectionId}`;
  if (!source) return base;
  const search = new URLSearchParams();
  if (source.fromProject) search.set('fromProject', source.fromProject);
  if (source.fromPage) search.set('fromPage', source.fromPage);
  if (source.fromTab) search.set('fromTab', source.fromTab);
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

export function buildUsagePath(projectId: string) {
  return `/projects/${projectId}/usage`;
}

export function buildSystemSettingsPath(section?: SystemSettingsSection) {
  return section ? `/settings/${section}` : '/settings';
}
