import { create } from 'zustand';
import {
  loadProjectStructure, saveProjectStructure, createNewProject,
  addSrcTable, removeSrcTable, updateTableSheetConfig,
  addWorkflow, updateWorkflow, removeWorkflow,
  addBehavior, updateBehavior, removeBehavior,
  addDesign, updateDesign, removeDesign,
} from './manager';
import type { ProjectStructure, SrcTableEntry, TableConfig, WorkflowFile, BehaviorFile, DesignFile } from './types';

interface ProjectStore {
  project: ProjectStructure | null;
  loading: boolean;
  projectId: string | null;

  initProject: (id: string) => Promise<void>;
  setProject: (p: ProjectStructure) => Promise<void>;
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
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  loading: true,
  projectId: null,

  initProject: async (id: string) => {
    set({ loading: true, projectId: id });
    const loaded = await loadProjectStructure(id);
    set({ project: loaded, loading: false });
  },

  setProject: async (p: ProjectStructure) => {
    set({ project: p });
    await saveProjectStructure(p);
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
    await saveProjectStructure(next);
  },

  removeTable: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeSrcTable(project, id);
    set({ project: next });
    await saveProjectStructure(next);
  },

  updateTableSheetConfig: async (tableId: string, sheetName: string, patch: Partial<TableConfig>) => {
    const { project } = get();
    if (!project) return;
    const next = updateTableSheetConfig(project, tableId, sheetName, patch);
    set({ project: next });
    await saveProjectStructure(next);
  },

  addWorkflow: async (wf: WorkflowFile) => {
    const { project } = get();
    if (!project) return;
    const next = addWorkflow(project, wf);
    set({ project: next });
    await saveProjectStructure(next);
  },

  updateWorkflow: async (id: string, patch: Partial<WorkflowFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateWorkflow(project, id, patch);
    set({ project: next });
    await saveProjectStructure(next);
  },

  removeWorkflow: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeWorkflow(project, id);
    set({ project: next });
    await saveProjectStructure(next);
  },

  addBehavior: async (bh: BehaviorFile) => {
    const { project } = get();
    if (!project) return;
    const next = addBehavior(project, bh);
    set({ project: next });
    await saveProjectStructure(next);
  },

  updateBehavior: async (id: string, patch: Partial<BehaviorFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateBehavior(project, id, patch);
    set({ project: next });
    await saveProjectStructure(next);
  },

  removeBehavior: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeBehavior(project, id);
    set({ project: next });
    await saveProjectStructure(next);
  },

  addDesign: async (design: DesignFile) => {
    const { project } = get();
    if (!project) return;
    const next = addDesign(project, design);
    set({ project: next });
    await saveProjectStructure(next);
  },

  updateDesign: async (id: string, patch: Partial<DesignFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateDesign(project, id, patch);
    set({ project: next });
    await saveProjectStructure(next);
  },

  removeDesign: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeDesign(project, id);
    set({ project: next });
    await saveProjectStructure(next);
  },
}));
