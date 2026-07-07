export type WorkspaceTab = 'data' | 'canvas' | 'designer' | 'behavior' | 'test';
export type ProjectSettingsSection = 'general' | 'versions' | 'behavior' | 'publish';
export type SystemSettingsSection = 'general' | 'storage' | 'editor' | 'experiments';
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
  return tab ? `/projects/${projectId}/workspace/${tab}` : `/projects/${projectId}/workspace`;
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
