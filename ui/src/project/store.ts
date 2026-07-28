import { create } from 'zustand';
import {
  loadProjectSnapshot, saveProjectStructure, createProjectStructure, createNewProject,
  addSrcTable, removeSrcTable, updateTableSheetConfig,
  addWorkflow, updateWorkflow, removeWorkflow,
  addBehavior, updateBehavior, removeBehavior,
  addDesign, updateDesign, removeDesign,
  addForm, updateForm, removeForm,
  addFormBehavior, updateFormBehavior, removeFormBehavior,
  addGlobalBehavior, updateGlobalBehavior, removeGlobalBehavior,
} from './manager';
import {
  openFilePicker,
} from './packageManager';
import { projectApi } from '../services/io/api';
import type { ProjectStructure, SrcTableEntry, TableConfig, WorkflowFile, BehaviorFile, DesignFile, FormEntry } from './types';

interface ProjectStore {
  project: ProjectStructure | null;
  loading: boolean;
  projectId: string | null;
  revision: string | null;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  dirty: boolean;
  saveError: string | null;

  initProject: (id: string) => Promise<void>;
  setProject: (p: ProjectStructure) => Promise<void>;
  persistProject: (p: ProjectStructure) => Promise<void>;
  refreshProject: () => Promise<void>;
  retrySave: () => Promise<void>;

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

export const useProjectStore = create<ProjectStore>((set, get) => {
  let saveQueue: Promise<void> = Promise.resolve();
  let latestSaveSequence = 0;

  const save = async (next: ProjectStructure) => {
    const sequence = ++latestSaveSequence;
    const projectId = next.config.id;
    set({ project: next, projectId, dirty: true, saveState: 'saving', saveError: null });

    let resolveSave!: () => void;
    let rejectSave!: (reason: unknown) => void;
    const completion = new Promise<void>((resolve, reject) => {
      resolveSave = resolve;
      rejectSave = reject;
    });

    saveQueue = saveQueue.catch(() => undefined).then(async () => {
      try {
        let revision = get().projectId === projectId ? get().revision : null;
        if (!revision) revision = (await loadProjectSnapshot(projectId))?.revision || null;
        if (!revision) throw new Error('无法确定项目 revision，请刷新项目后重试');

        const saved = await saveProjectStructure(next, revision, crypto.randomUUID());
        if (get().projectId === projectId) {
          if (sequence === latestSaveSequence) {
            set({
              project: saved.project,
              revision: saved.revision,
              dirty: false,
              saveState: 'saved',
              saveError: null,
            });
          } else {
            // A newer optimistic draft is already visible. Only advance the
            // revision token; never replace that draft with this older result.
            set({ revision: saved.revision });
          }
        }
        resolveSave();
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (get().projectId === projectId && sequence === latestSaveSequence) {
          set({ project: next, dirty: true, saveState: 'error', saveError: error.message });
        }
        rejectSave(error);
      }
    });

    return completion;
  };

  return {
  project: null,
  loading: true,
  projectId: null,
  revision: null,
  saveState: 'idle',
  dirty: false,
  saveError: null,

  initProject: async (id: string) => {
    set({ loading: true, projectId: id });
    try {
      const loaded = await loadProjectSnapshot(id);
      if (loaded) {
        set({ project: loaded.project, revision: loaded.revision, loading: false, dirty: false, saveState: 'idle', saveError: null });
      }
      else set({ loading: false });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      set({ loading: false, saveState: 'error', saveError: error.message });
    }
  },

  setProject: async (p: ProjectStructure) => {
    await save(p);
  },

  persistProject: async (p: ProjectStructure) => {
    await save(p);
  },

  refreshProject: async () => {
    const { projectId } = get();
    if (!projectId) return;
    const loaded = await loadProjectSnapshot(projectId);
    set({
      project: loaded?.project || null,
      revision: loaded?.revision || null,
      dirty: false,
      saveState: 'idle',
      saveError: null,
    });
  },

  retrySave: async () => {
    const { project, dirty } = get();
    if (project && dirty) await save(project);
  },

  addTable: async (table: SrcTableEntry) => {
    const { project } = get();
    if (!project) return;
    const next = addSrcTable(project, table);
    await save(next);
  },

  removeTable: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeSrcTable(project, id);
    await save(next);
  },

  updateTableSheetConfig: async (tableId: string, sheetName: string, patch: Partial<TableConfig>) => {
    const { project } = get();
    if (!project) return;
    const next = updateTableSheetConfig(project, tableId, sheetName, patch);
    await save(next);
  },

  addWorkflow: async (wf: WorkflowFile) => {
    const { project } = get();
    if (!project) return;
    const next = addWorkflow(project, wf);
    await save(next);
  },

  updateWorkflow: async (id: string, patch: Partial<WorkflowFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateWorkflow(project, id, patch);
    await save(next);
  },

  removeWorkflow: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeWorkflow(project, id);
    await save(next);
  },

  addBehavior: async (bh: BehaviorFile) => {
    const { project } = get();
    if (!project) return;
    const next = addBehavior(project, bh);
    await save(next);
  },

  updateBehavior: async (id: string, patch: Partial<BehaviorFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateBehavior(project, id, patch);
    await save(next);
  },

  removeBehavior: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeBehavior(project, id);
    await save(next);
  },

  addDesign: async (design: DesignFile) => {
    const { project } = get();
    if (!project) return;
    const next = addDesign(project, design);
    await save(next);
  },

  updateDesign: async (id: string, patch: Partial<DesignFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateDesign(project, id, patch);
    await save(next);
  },

  removeDesign: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeDesign(project, id);
    await save(next);
  },

  exportAsPackage: async () => {
    const { project } = get();
    if (!project) return;
    await projectApi.downloadPackage(project.config.id, project.config.name);
  },

  importFromPackage: async () => {
    const file = await openFilePicker();
    if (!file) return;
    const result = await projectApi.importPackage(file);
    const imported = result.project || result;
    const loaded = await loadProjectSnapshot(imported.config.id);
    set({
      project: loaded?.project || imported,
      projectId: imported.config.id,
      revision: loaded?.revision || null,
      dirty: false,
      saveState: 'idle',
      saveError: null,
    });
  },

  addForm: async (form: FormEntry) => {
    const { project } = get();
    if (!project) return;
    const next = addForm(project, form);
    await save(next);
  },

  updateForm: async (id: string, patch: Partial<FormEntry>) => {
    const { project } = get();
    if (!project) return;
    const next = updateForm(project, id, patch);
    await save(next);
  },

  removeForm: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeForm(project, id);
    await save(next);
  },

  addFormBehavior: async (formId: string, bh: BehaviorFile) => {
    const { project } = get();
    if (!project) return;
    const next = addFormBehavior(project, formId, bh);
    await save(next);
  },

  updateFormBehavior: async (formId: string, bhId: string, patch: Partial<BehaviorFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateFormBehavior(project, formId, bhId, patch);
    await save(next);
  },

  removeFormBehavior: async (formId: string, bhId: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeFormBehavior(project, formId, bhId);
    await save(next);
  },

  addGlobalBehavior: async (bh: BehaviorFile) => {
    const { project } = get();
    if (!project) return;
    const next = addGlobalBehavior(project, bh);
    await save(next);
  },

  updateGlobalBehavior: async (id: string, patch: Partial<BehaviorFile>) => {
    const { project } = get();
    if (!project) return;
    const next = updateGlobalBehavior(project, id, patch);
    await save(next);
  },

  removeGlobalBehavior: async (id: string) => {
    const { project } = get();
    if (!project) return;
    const next = removeGlobalBehavior(project, id);
    await save(next);
  },
  };
});
