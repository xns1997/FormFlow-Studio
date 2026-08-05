import type { ProjectStructure } from '../../project/types';

export interface ProjectVersion {
  id: string;
  version: number;
  timestamp: string;
  label: string;
  snapshot: string;
}

/** 为项目创建版本快照。 */
export function createVersion(project: ProjectStructure, label: string): ProjectVersion {
  const versions = getVersions(project.config.id);
  const nextVersion = versions.length > 0 ? Math.max(...versions.map((item) => item.version)) + 1 : 1;
  const version = {
    id: `${project.config.id}_v${nextVersion}`,
    version: nextVersion,
    timestamp: new Date().toISOString(),
    label: label || `版本 ${nextVersion}`,
    snapshot: JSON.stringify(project),
  };
  try { localStorage.setItem(`formflow_versions_${project.config.id}`, JSON.stringify([...versions, version])); } catch { /* quota exceeded */ }
  return version;
}

/** 列出项目版本。 */
export function getVersions(projectId: string): ProjectVersion[] {
  try {
    const data = localStorage.getItem(`formflow_versions_${projectId}`);
    if (!data) return [];
    return JSON.parse(data) as ProjectVersion[];
  } catch { return []; }
}

/** 恢复指定版本（返回快照结构）。 */
export function restoreVersion(projectId: string, versionId: string): ProjectStructure | null {
  const version = getVersions(projectId).find((item) => item.id === versionId);
  if (!version) return null;
  try { return JSON.parse(version.snapshot) as ProjectStructure; }
  catch { return null; }
}

/** 删除版本。 */
export function deleteVersion(projectId: string, versionId: string): void {
  try {
    localStorage.setItem(
      `formflow_versions_${projectId}`,
      JSON.stringify(getVersions(projectId).filter((item) => item.id !== versionId)),
    );
  } catch { /* ignore */ }
}

/** 清空项目全部版本。 */
export function clearVersions(projectId: string): void {
  try { localStorage.removeItem(`formflow_versions_${projectId}`); } catch { /* ignore */ }
}
