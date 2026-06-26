import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  loadProjectStructure, saveProjectStructure, createNewProject,
  addSrcTable, removeSrcTable,
  addWorkflow, updateWorkflow, removeWorkflow,
  addBehavior, updateBehavior, removeBehavior,
} from './manager';
import type { ProjectStructure, SrcTableEntry, WorkflowFile, BehaviorFile } from './types';

interface ProjectContextType {
  project: ProjectStructure | null;
  loading: boolean;
  setProject: (p: ProjectStructure) => void;
  refreshProject: () => void;
  addTable: (table: SrcTableEntry) => void;
  removeTable: (id: string) => void;
  addWorkflow: (wf: WorkflowFile) => void;
  updateWorkflow: (id: string, patch: Partial<WorkflowFile>) => void;
  removeWorkflow: (id: string) => void;
  addBehavior: (bh: BehaviorFile) => void;
  updateBehavior: (id: string, patch: Partial<BehaviorFile>) => void;
  removeBehavior: (id: string) => void;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [project, setProjectState] = useState<ProjectStructure | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const urlParts = window.location.pathname.split('/');
    const projectId = urlParts[urlParts.length - 1];
    if (projectId && projectId !== 'projects') {
      loadProjectStructure(projectId).then((p) => {
        setProjectState(p);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const setProject = useCallback(async (p: ProjectStructure) => {
    setProjectState(p);
    try { await saveProjectStructure(p); } catch {}
  }, []);

  const refreshProject = useCallback(async () => {
    if (!project) return;
    const loaded = await loadProjectStructure(project.config.id);
    if (loaded) setProjectState(loaded);
  }, [project]);

  const addTable = useCallback(async (table: SrcTableEntry) => {
    setProjectState((prev) => {
      if (!prev) return prev;
      const next = addSrcTable(prev, table);
      saveProjectStructure(next);
      return next;
    });
  }, []);

  const removeTable = useCallback(async (id: string) => {
    setProjectState((prev) => {
      if (!prev) return prev;
      const next = removeSrcTable(prev, id);
      saveProjectStructure(next);
      return next;
    });
  }, []);

  const addWorkflowFn = useCallback(async (wf: WorkflowFile) => {
    setProjectState((prev) => {
      if (!prev) return prev;
      const next = addWorkflow(prev, wf);
      saveProjectStructure(next);
      return next;
    });
  }, []);

  const updateWorkflowFn = useCallback(async (id: string, patch: Partial<WorkflowFile>) => {
    setProjectState((prev) => {
      if (!prev) return prev;
      const next = updateWorkflow(prev, id, patch);
      saveProjectStructure(next);
      return next;
    });
  }, []);

  const removeWorkflowFn = useCallback(async (id: string) => {
    setProjectState((prev) => {
      if (!prev) return prev;
      const next = removeWorkflow(prev, id);
      saveProjectStructure(next);
      return next;
    });
  }, []);

  const addBehaviorFn = useCallback(async (bh: BehaviorFile) => {
    setProjectState((prev) => {
      if (!prev) return prev;
      const next = addBehavior(prev, bh);
      saveProjectStructure(next);
      return next;
    });
  }, []);

  const updateBehaviorFn = useCallback(async (id: string, patch: Partial<BehaviorFile>) => {
    setProjectState((prev) => {
      if (!prev) return prev;
      const next = updateBehavior(prev, id, patch);
      saveProjectStructure(next);
      return next;
    });
  }, []);

  const removeBehaviorFn = useCallback(async (id: string) => {
    setProjectState((prev) => {
      if (!prev) return prev;
      const next = removeBehavior(prev, id);
      saveProjectStructure(next);
      return next;
    });
  }, []);

  if (loading) return <div className="loading-splash"><div className="loading-spinner" /><p>加载项目…</p></div>;

  return (
    <ProjectContext.Provider value={{
      project, loading, setProject, refreshProject,
      addTable, removeTable,
      addWorkflow: addWorkflowFn, updateWorkflow: updateWorkflowFn, removeWorkflow: removeWorkflowFn,
      addBehavior: addBehaviorFn, updateBehavior: updateBehaviorFn, removeBehavior: removeBehaviorFn,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}
