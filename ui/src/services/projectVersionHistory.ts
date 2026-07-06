import type { ProjectStructure } from '../project/types';

export interface ProjectVersion {
  id: string;
  version: number;
  timestamp: string;
  label: string;
  snapshot: string;
}

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
  localStorage.setItem(`formflow_versions_${project.config.id}`, JSON.stringify([...versions, version]));
  return version;
}

export function getVersions(projectId: string): ProjectVersion[] {
  const data = localStorage.getItem(`formflow_versions_${projectId}`);
  if (!data) return [];
  try { return JSON.parse(data) as ProjectVersion[]; }
  catch { return []; }
}

export function restoreVersion(projectId: string, versionId: string): ProjectStructure | null {
  const version = getVersions(projectId).find((item) => item.id === versionId);
  if (!version) return null;
  try { return JSON.parse(version.snapshot) as ProjectStructure; }
  catch { return null; }
}

export function deleteVersion(projectId: string, versionId: string): void {
  localStorage.setItem(
    `formflow_versions_${projectId}`,
    JSON.stringify(getVersions(projectId).filter((item) => item.id !== versionId)),
  );
}

export function clearVersions(projectId: string): void {
  localStorage.removeItem(`formflow_versions_${projectId}`);
}
