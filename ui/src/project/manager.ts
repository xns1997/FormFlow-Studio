// 项目文件管理器 - 通过后端 API 存储

import type {
  ProjectStructure, SrcTableEntry, TableConfig,
  WorkflowFile, BehaviorFile, OutputFile, DesignFile,
  ProjectSettings, FormEntry, SheetBehaviorEntry, ProjectRelease,
} from './types';
import {
  createDefaultProjectSettings,
  createDefaultProjectRelease,
  normalizeProjectRelease,
  normalizeProjectSettings,
} from './types';
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
      version: '2.0.0',
      createdAt: now,
      updatedAt: now,
      author: '',
      tags: [],
    },
    settings: { ...createDefaultProjectSettings(), updatedAt: now },
    release: {
      ...createDefaultProjectRelease(),
      defaultFormId: undefined,
      defaultSheet: undefined,
    },
    srcTable: [],
    workflows: [],
    globalBehaviors: [],
    sheetBehaviors: [],
    forms: [],
    outputs: [],
  };
}

export function normalizeProjectStructure(project: ProjectStructure): ProjectStructure {
  // 兼容旧格式：迁移 designs + behaviors → forms
  let forms = project.forms || [];
  if (!forms.length && project.designs?.length) {
    const now = new Date().toISOString();
    forms = project.designs.map((design) => ({
      id: `form_${design.id}`,
      name: design.name,
      design,
      behaviors: project.behaviors || [],
      createdAt: design.createdAt || now,
      updatedAt: design.updatedAt || now,
    }));
  }

  return {
    ...project,
    settings: normalizeProjectSettings(project.settings as ProjectSettings | undefined),
    globalBehaviors: project.globalBehaviors || [],
    sheetBehaviors: project.sheetBehaviors || [],
    forms,
    release: normalizeProjectRelease(project.release as ProjectRelease | undefined, forms, project.srcTable || []),
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
  const designs = project.designs || [];
  const exists = designs.some((item) => item.id === design.id);
  return {
    ...project,
    designs: exists
      ? designs.map((item) => item.id === design.id ? nextDesign : item)
      : [...designs, nextDesign],
    config: { ...project.config, updatedAt: now },
  };
}

export function updateDesign(project: ProjectStructure, designId: string, patch: Partial<DesignFile>): ProjectStructure {
  const now = new Date().toISOString();
  return {
    ...project,
    designs: (project.designs || []).map((design) => design.id === designId ? { ...design, ...patch, updatedAt: now } : design),
    config: { ...project.config, updatedAt: now },
  };
}

export function removeDesign(project: ProjectStructure, designId: string): ProjectStructure {
  const now = new Date().toISOString();
  return {
    ...project,
    designs: (project.designs || []).filter((design) => design.id !== designId),
    config: { ...project.config, updatedAt: now },
  };
}

// ── 行为 ──────────────────────────────────────

export function addBehavior(project: ProjectStructure, behavior: BehaviorFile): ProjectStructure {
  return {
    ...project,
    behaviors: [...(project.behaviors || []), behavior],
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function updateBehavior(project: ProjectStructure, behaviorId: string, patch: Partial<BehaviorFile>): ProjectStructure {
  return {
    ...project,
    behaviors: (project.behaviors || []).map((b) => b.id === behaviorId ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function removeBehavior(project: ProjectStructure, behaviorId: string): ProjectStructure {
  return {
    ...project,
    behaviors: (project.behaviors || []).filter((b) => b.id !== behaviorId),
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

// ── 表单实例 ──────────────────────────────────────

export function addForm(project: ProjectStructure, form: FormEntry): ProjectStructure {
  return {
    ...project,
    forms: [...project.forms, form],
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function updateForm(project: ProjectStructure, formId: string, patch: Partial<FormEntry>): ProjectStructure {
  return {
    ...project,
    forms: project.forms.map((f) => f.id === formId ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function removeForm(project: ProjectStructure, formId: string): ProjectStructure {
  return {
    ...project,
    forms: project.forms.filter((f) => f.id !== formId),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function addFormBehavior(project: ProjectStructure, formId: string, behavior: BehaviorFile): ProjectStructure {
  return {
    ...project,
    forms: project.forms.map((f) => f.id === formId
      ? { ...f, behaviors: [...f.behaviors, behavior], updatedAt: new Date().toISOString() }
      : f),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function updateFormBehavior(project: ProjectStructure, formId: string, behaviorId: string, patch: Partial<BehaviorFile>): ProjectStructure {
  return {
    ...project,
    forms: project.forms.map((f) => f.id === formId
      ? { ...f, behaviors: f.behaviors.map((b) => b.id === behaviorId ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b), updatedAt: new Date().toISOString() }
      : f),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function removeFormBehavior(project: ProjectStructure, formId: string, behaviorId: string): ProjectStructure {
  return {
    ...project,
    forms: project.forms.map((f) => f.id === formId
      ? { ...f, behaviors: f.behaviors.filter((b) => b.id !== behaviorId), updatedAt: new Date().toISOString() }
      : f),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

// ── 全局行为 ──────────────────────────────────────

export function addGlobalBehavior(project: ProjectStructure, behavior: BehaviorFile): ProjectStructure {
  return {
    ...project,
    globalBehaviors: [...project.globalBehaviors, behavior],
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

// ── 工作表行为 ──────────────────────────────────────

export function setSheetBehaviors(
  project: ProjectStructure,
  tableId: string,
  sheetName: string,
  behaviors: BehaviorFile[],
): ProjectStructure {
  const now = new Date().toISOString();
  const nextEntry: SheetBehaviorEntry = { tableId, sheetName, behaviors, updatedAt: now };
  const existing = project.sheetBehaviors || [];
  const matched = existing.some((entry) => entry.tableId === tableId && entry.sheetName === sheetName);
  return {
    ...project,
    sheetBehaviors: matched
      ? existing.map((entry) => (entry.tableId === tableId && entry.sheetName === sheetName ? nextEntry : entry))
      : [...existing, nextEntry],
    config: { ...project.config, updatedAt: now },
  };
}

export function updateGlobalBehavior(project: ProjectStructure, behaviorId: string, patch: Partial<BehaviorFile>): ProjectStructure {
  return {
    ...project,
    globalBehaviors: project.globalBehaviors.map((b) => b.id === behaviorId ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}

export function removeGlobalBehavior(project: ProjectStructure, behaviorId: string): ProjectStructure {
  return {
    ...project,
    globalBehaviors: project.globalBehaviors.filter((b) => b.id !== behaviorId),
    config: { ...project.config, updatedAt: new Date().toISOString() },
  };
}
