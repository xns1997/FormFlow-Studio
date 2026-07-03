// 项目文件管理器 - 通过后端 API 存储

import type {
  ProjectStructure, SrcTableEntry, TableConfig,
  WorkflowFile, BehaviorFile, OutputFile, DesignFile,
  ProjectSettings,
} from './types';
import { createDefaultProjectSettings, normalizeProjectSettings } from './types';
import { projectApi } from '../services/api';

// ── 项目 CRUD ──────────────────────────────────────

export async function saveProjectStructure(project: ProjectStructure): Promise<void> {
  await projectApi.update(project.config.id, project);
}

export async function createProjectStructure(project: ProjectStructure): Promise<ProjectStructure> {
  return normalizeProjectStructure(await projectApi.create(project));
}

export async function loadProjectStructure(projectId: string): Promise<ProjectStructure | null> {
  try {
    return normalizeProjectStructure(await projectApi.get(projectId));
  } catch { return null; }
}

export async function listProjects(): Promise<Array<{ id: string; name: string; updatedAt: string; tableCount: number }>> {
  try {
    return await projectApi.list();
  } catch { return []; }
}

export async function deleteProject(projectId: string): Promise<void> {
  await projectApi.remove(projectId);
}

export async function cloneProject(projectId: string): Promise<ProjectStructure> {
  return normalizeProjectStructure(await projectApi.clone(projectId));
}

export function createNewProject(name: string = '我的项目'): ProjectStructure {
  const now = new Date().toISOString();
  return {
    config: {
      id: `proj_${Date.now()}`,
      name,
      description: '',
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      author: '',
      tags: [],
    },
    settings: { ...createDefaultProjectSettings(), updatedAt: now },
    srcTable: [],
    workflows: [],
    behaviors: [],
    outputs: [],
    designs: [],
  };
}

export function normalizeProjectStructure(project: ProjectStructure): ProjectStructure {
  return {
    ...project,
    settings: normalizeProjectSettings(project.settings as ProjectSettings | undefined),
  };
}

// ── 数据表 ──────────────────────────────────────

export function addSrcTable(project: ProjectStructure, table: SrcTableEntry): ProjectStructure {
  return {
    ...project,
    srcTable: [...project.srcTable, table],
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function removeSrcTable(project: ProjectStructure, tableId: string): ProjectStructure {
  return {
    ...project,
    srcTable: project.srcTable.filter((t) => t.id !== tableId),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function updateTableSheetConfig(
  project: ProjectStructure,
  tableId: string,
  sheetName: string,
  patch: Partial<TableConfig>,
): ProjectStructure {
  return {
    ...project,
    srcTable: project.srcTable.map((table) =>
      table.id !== tableId
        ? table
        : {
            ...table,
            sheets: table.sheets.map((sheet) =>
              sheet.name !== sheetName
                ? sheet
                : {
                    ...sheet,
                    config: {
                      ...sheet.config,
                      ...patch,
                    } as TableConfig,
                  },
            ),
          },
    ),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

// ── 流程 ──────────────────────────────────────

export function addWorkflow(project: ProjectStructure, workflow: WorkflowFile): ProjectStructure {
  return {
    ...project,
    workflows: [...project.workflows, workflow],
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function updateWorkflow(project: ProjectStructure, workflowId: string, patch: Partial<WorkflowFile>): ProjectStructure {
  return {
    ...project,
    workflows: project.workflows.map((w) => w.id === workflowId ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function removeWorkflow(project: ProjectStructure, workflowId: string): ProjectStructure {
  return {
    ...project,
    workflows: project.workflows.filter((w) => w.id !== workflowId),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

// ── 表单设计 ──────────────────────────────────────

export function addDesign(project: ProjectStructure, design: DesignFile): ProjectStructure {
  const now = new Date().toISOString();
  const nextDesign = { ...design, updatedAt: now };
  const exists = project.designs.some((item) => item.id === design.id);
  return {
    ...project,
    designs: exists
      ? project.designs.map((item) => item.id === design.id ? nextDesign : item)
      : [...project.designs, nextDesign],
    config: { ...project.config, updatedAt: now },
  };
}

export function updateDesign(project: ProjectStructure, designId: string, patch: Partial<DesignFile>): ProjectStructure {
  const now = new Date().toISOString();
  return {
    ...project,
    designs: project.designs.map((design) => design.id === designId ? { ...design, ...patch, updatedAt: now } : design),
    config: { ...project.config, updatedAt: now },
  };
}

export function removeDesign(project: ProjectStructure, designId: string): ProjectStructure {
  const now = new Date().toISOString();
  return {
    ...project,
    designs: project.designs.filter((design) => design.id !== designId),
    config: { ...project.config, updatedAt: now },
  };
}

// ── 行为 ──────────────────────────────────────

export function addBehavior(project: ProjectStructure, behavior: BehaviorFile): ProjectStructure {
  return {
    ...project,
    behaviors: [...project.behaviors, behavior],
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function updateBehavior(project: ProjectStructure, behaviorId: string, patch: Partial<BehaviorFile>): ProjectStructure {
  return {
    ...project,
    behaviors: project.behaviors.map((b) => b.id === behaviorId ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function removeBehavior(project: ProjectStructure, behaviorId: string): ProjectStructure {
  return {
    ...project,
    behaviors: project.behaviors.filter((b) => b.id !== behaviorId),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

// ── 输出 ──────────────────────────────────────

export function addOutput(project: ProjectStructure, output: OutputFile): ProjectStructure {
  return {
    ...project,
    outputs: [...project.outputs, output],
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function removeOutput(project: ProjectStructure, outputId: string): ProjectStructure {
  return {
    ...project,
    outputs: project.outputs.filter((o) => o.id !== outputId),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

// ── 导出 ──────────────────────────────────────

export function downloadProjectFile(project: ProjectStructure): void {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.config.name || 'formflow'}.formflow.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importProjectFile(file: File): Promise<ProjectStructure> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = normalizeProjectStructure(JSON.parse(reader.result as string) as ProjectStructure);
        project.config.id = `proj_${Date.now()}`;
        project.config.updatedAt = new Date().toISOString();
        resolve(project);
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
