import { create } from 'zustand';
import {
  loadProjectStructure, saveProjectStructure, createProjectStructure, createNewProject,
  addSrcTable, removeSrcTable, updateTableSheetConfig,
  addWorkflow, updateWorkflow, removeWorkflow,
  addBehavior, updateBehavior, removeBehavior,
  addDesign, updateDesign, removeDesign,
  addForm, updateForm, removeForm,
  addFormBehavior, updateFormBehavior, removeFormBehavior,
  addGlobalBehavior, updateGlobalBehavior, removeGlobalBehavior,
} from './manager';
import {
  downloadPackageZip, openFilePicker,
} from './packageManager';
import { createProjectFromZip } from './creation';
import type { ProjectStructure, SrcTableEntry, TableConfig, WorkflowFile, BehaviorFile, DesignFile, FormEntry } from './types';

async function trySave(p: ProjectStructure): Promise<void> {
  try { await saveProjectStructure(p); } catch { /* server offline */ }
}

interface ProjectStore {
  project: ProjectStructure | null;
  loading: boolean;
  projectId: string | null;

  initProject: (id: string) => Promise<void>;
  setProject: (p: ProjectStructure) => Promise<void>;
  persistProject: (p: ProjectStructure) => Promise<void>;
  refreshProject: () => Promise<void>;

  addTable: (table: SrcTableEntry) => Promise<void>;
  removeTable: (id: string) => Promise<void>;
  updateTableSheetConfig: (tableId: string, sheetName: string, patch: Partial<TableConfig>) => Promise<void>;

  addWorkflow: (wf: WorkflowFile) => Promise<void>;
  updateWorkflow: (id: string, patch: Partial<WorkflowFile>) => Promise<void>;
  removeWorkflow: (id: string) => Promise<void>;

  addBehavior: (bh: BehaviorFile) => Promise<void>;
  updateBehavior: (id: string, patch: Partial<BehaviorFile>) => Promise<void>;
  removeBehavior: (id: string) => Promise<void>;

  addDesign: (design: DesignFile) => Promise<void>;
  updateDesign: (id: string, patch: Partial<DesignFile>) => Promise<void>;
  removeDesign: (id: string) => Promise<void>;

  addForm: (form: FormEntry) => Promise<void>;
  updateForm: (id: string, patch: Partial<FormEntry>) => Promise<void>;
  removeForm: (id: string) => Promise<void>;

  addFormBehavior: (formId: string, bh: BehaviorFile) => Promise<void>;
  updateFormBehavior: (formId: string, bhId: string, patch: Partial<BehaviorFile>) => Promise<void>;
  removeFormBehavior: (formId: string, bhId: string) => Promise<void>;

  addGlobalBehavior: (bh: BehaviorFile) => Promise<void>;
  updateGlobalBehavior: (id: string, patch: Partial<BehaviorFile>) => Promise<void>;
  removeGlobalBehavior: (id: string) => Promise<void>;

  exportAsPackage: () => Promise<void>;
  importFromPackage: () => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  loading: true,
  projectId: null,

  initProject: async (id: string) => {
    set({ loading: true, projectId: id });
    try {
      const loaded = await loadProjectStructure(id);
      if (loaded) set({ project: loaded, loading: false });
      else set({ loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setProject: async (p: ProjectStructure) => {
    set({ project: p });
    await trySave(p);
  },

  persistProject: async (p: ProjectStructure) => {
    await saveProjectStructure(p);
    set({ project: p });
  },

  refreshProject: async () => {
    const { projectId } = get();
    if (!projectId) return;
    const loaded = await loadProjectStructure(projectId);
    set({ project: loaded });
  },

  addTable: async (table: SrcTableEntry) => {
    const { project } = get();
    if (!project) return;
    const next = addSrcTable(project, table);
    set({ project: next });
    await trySave(next);
  },

  removeTable: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeSrcTable(project, id);
    set({ project: next });
    await trySave(next);
  },

  updateTableSheetConfig: async (tableId: string, sheetName: string, patch: Partial<TableConfig>) => {
    const { project } = get();
    if (!project) return;
    const next = updateTableSheetConfig(project, tableId, sheetName, patch);
    set({ project: next });
    await trySave(next);
  },

  addWorkflow: async (wf: WorkflowFile) => {
    const { project } = get();
    if (!project) return;
    const next = addWorkflow(project, wf);
    set({ project: next });
    await trySave(next);
  },

  updateWorkflow: async (id: string, patch: Partial<WorkflowFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateWorkflow(project, id, patch);
    set({ project: next });
    await trySave(next);
  },

  removeWorkflow: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeWorkflow(project, id);
    set({ project: next });
    await trySave(next);
  },

  addBehavior: async (bh: BehaviorFile) => {
    const { project } = get();
    if (!project) return;
    const next = addBehavior(project, bh);
    set({ project: next });
    await trySave(next);
  },

  updateBehavior: async (id: string, patch: Partial<BehaviorFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateBehavior(project, id, patch);
    set({ project: next });
    await trySave(next);
  },

  removeBehavior: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeBehavior(project, id);
    set({ project: next });
    await trySave(next);
  },

  addDesign: async (design: DesignFile) => {
    const { project } = get();
    if (!project) return;
    const next = addDesign(project, design);
    set({ project: next });
    await trySave(next);
  },

  updateDesign: async (id: string, patch: Partial<DesignFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateDesign(project, id, patch);
    set({ project: next });
    await trySave(next);
  },

  removeDesign: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeDesign(project, id);
    set({ project: next });
    await trySave(next);
  },

  exportAsPackage: async () => {
    const { project } = get();
    if (!project) return;
    await downloadPackageZip(project);
  },

  importFromPackage: async () => {
    const file = await openFilePicker();
    if (!file) return;
    const imported = await createProjectFromZip(file, {
      name: file.name.replace(/\.zip$/i, ''),
      description: '',
      author: '',
      tags: [],
    });
    set({ project: imported, projectId: imported.config.id });
    await createProjectStructure(imported);
  },

  addForm: async (form: FormEntry) => {
    const { project } = get();
    if (!project) return;
    const next = addForm(project, form);
    set({ project: next });
    await trySave(next);
  },

  updateForm: async (id: string, patch: Partial<FormEntry>) => {
    const { project } = get();
    if (!project) return;
    const next = updateForm(project, id, patch);
    set({ project: next });
    await trySave(next);
  },

  removeForm: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeForm(project, id);
    set({ project: next });
    await trySave(next);
  },

  addFormBehavior: async (formId: string, bh: BehaviorFile) => {
    const { project } = get();
    if (!project) return;
    const next = addFormBehavior(project, formId, bh);
    set({ project: next });
    await trySave(next);
  },

  updateFormBehavior: async (formId: string, bhId: string, patch: Partial<BehaviorFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateFormBehavior(project, formId, bhId, patch);
    set({ project: next });
    await trySave(next);
  },

  removeFormBehavior: async (formId: string, bhId: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeFormBehavior(project, formId, bhId);
    set({ project: next });
    await trySave(next);
  },

  addGlobalBehavior: async (bh: BehaviorFile) => {
    const { project } = get();
    if (!project) return;
    const next = addGlobalBehavior(project, bh);
    set({ project: next });
    await trySave(next);
  },

  updateGlobalBehavior: async (id: string, patch: Partial<BehaviorFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateGlobalBehavior(project, id, patch);
    set({ project: next });
    await trySave(next);
  },

  removeGlobalBehavior: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeGlobalBehavior(project, id);
    set({ project: next });
    await trySave(next);
  },
}));
