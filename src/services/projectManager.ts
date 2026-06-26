import type { FormProject, ProjectSettings, DataSourceConfig } from '../models';

export function createDefaultProject(): FormProject {
  return {
    id: `proj_${Date.now()}`,
    name: '我的表单项目',
    description: '',
    dataSources: [],
    pages: [{ id: 'page_1', name: '主页', components: [], layout: { type: 'form', columns: 2, gutter: 16, maxWidth: 960 } }],
    components: [],
    bindings: [],
    behaviorGraphs: [],
    scripts: [],
    testCases: [],
    settings: createDefaultSettings(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultSettings(): ProjectSettings {
  return {
    data: { defaultDataSource: '', defaultSheet: '', headerRow: 1, dataStartRow: 2, primaryKey: '', allowAddRows: true, allowDeleteRows: true, allowModifyOriginal: false },
    form: { name: '', description: '', defaultPage: 'page_1', theme: 'default', layoutMode: 'form', responsiveBreakpoints: { sm: 640, md: 768, lg: 1024 }, showSubmitButton: true, showResetButton: true },
    behavior: { enableJsScripts: true, enableNodeBehavior: true, scriptTimeout: 5000, behaviorOrder: 'node-first', errorStrategy: 'show-error', loopProtection: 100 },
    permission: { mode: 'edit', fieldLevelPermissions: {}, componentLevelPermissions: {} },
    publish: { format: 'json', allowWriteBack: false, generateChangeLog: true, outputFileName: 'formflow-export' },
  };
}

export function saveProject(project: FormProject): void {
  const data = JSON.stringify(project, null, 2);
  localStorage.setItem(`formflow_project_${project.id}`, data);
  localStorage.setItem('formflow_last_project_id', project.id);
}

export function loadProject(projectId: string): FormProject | null {
  const data = localStorage.getItem(`formflow_project_${projectId}`);
  if (!data) return null;
  try { return JSON.parse(data) as FormProject; } catch { return null; }
}

export function loadLastProject(): FormProject | null {
  const id = localStorage.getItem('formflow_last_project_id');
  if (!id) return null;
  return loadProject(id);
}

export function listProjects(): Array<{ id: string; name: string; updatedAt: string }> {
  const projects: Array<{ id: string; name: string; updatedAt: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('formflow_project_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '') as FormProject;
        projects.push({ id: data.id, name: data.name, updatedAt: data.updatedAt });
      } catch {}
    }
  }
  return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function deleteProject(projectId: string): void {
  localStorage.removeItem(`formflow_project_${projectId}`);
  if (localStorage.getItem('formflow_last_project_id') === projectId) {
    localStorage.removeItem('formflow_last_project_id');
  }
}

export function exportProject(project: FormProject): Blob {
  const data = JSON.stringify(project, null, 2);
  return new Blob([data], { type: 'application/json' });
}

export function downloadProject(project: FormProject): void {
  const blob = exportProject(project);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name || 'formflow'}.formflow.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importProject(file: File): Promise<FormProject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result as string) as FormProject;
        project.id = `proj_${Date.now()}`;
        project.updatedAt = new Date().toISOString();
        resolve(project);
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ── 版本管理 ──────────────────────────────────────────

export interface ProjectVersion {
  id: string;
  version: number;
  timestamp: string;
  label: string;
  snapshot: string;
}

export function createVersion(project: FormProject, label: string): ProjectVersion {
  const versions = getVersions(project.id);
  const nextVersion = versions.length > 0 ? Math.max(...versions.map((v) => v.version)) + 1 : 1;
  const version: ProjectVersion = {
    id: `${project.id}_v${nextVersion}`,
    version: nextVersion,
    timestamp: new Date().toISOString(),
    label: label || `版本 ${nextVersion}`,
    snapshot: JSON.stringify(project),
  };
  const allVersions = [...versions, version];
  localStorage.setItem(`formflow_versions_${project.id}`, JSON.stringify(allVersions));
  return version;
}

export function getVersions(projectId: string): ProjectVersion[] {
  const data = localStorage.getItem(`formflow_versions_${projectId}`);
  if (!data) return [];
  try { return JSON.parse(data) as ProjectVersion[]; } catch { return []; }
}

export function restoreVersion(projectId: string, versionId: string): FormProject | null {
  const versions = getVersions(projectId);
  const version = versions.find((v) => v.id === versionId);
  if (!version) return null;
  try { return JSON.parse(version.snapshot) as FormProject; } catch { return null; }
}

export function deleteVersion(projectId: string, versionId: string): void {
  const versions = getVersions(projectId).filter((v) => v.id !== versionId);
  localStorage.setItem(`formflow_versions_${projectId}`, JSON.stringify(versions));
}

export function clearVersions(projectId: string): void {
  localStorage.removeItem(`formflow_versions_${projectId}`);
}

// ── 写回策略 ──────────────────────────────────────────

export interface WriteBackStrategy {
  mode: 'none' | 'changeLog' | 'newExcel' | 'csv' | 'json';
  outputFileName: string;
  includeMetadata: boolean;
  overwriteOriginal: boolean;
}

export const defaultWriteBackStrategy: WriteBackStrategy = {
  mode: 'changeLog',
  outputFileName: 'formflow-output',
  includeMetadata: true,
  overwriteOriginal: false,
};

export function getWriteBackStrategy(project: FormProject): WriteBackStrategy {
  const pub = project.settings.publish;
  return {
    mode: pub.allowWriteBack ? (pub.format as WriteBackStrategy['mode']) : 'changeLog',
    outputFileName: pub.outputFileName || 'formflow-output',
    includeMetadata: pub.generateChangeLog,
    overwriteOriginal: false,
  };
}
