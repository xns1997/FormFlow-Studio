import { buildProjectTemplate, PROJECT_TEMPLATES } from '../../../shared/project-templates';
import type {
  ProjectTemplateDescriptor,
  ProjectTemplateId,
  ProjectTemplateKind,
} from '../../../shared/project-templates';
import type { ProjectStructure } from './types';
import { createNewProject, normalizeProjectStructure } from './manager';
import { importFormFlowPackage } from './packageManager';

export type ProjectCreationMode = 'blank' | 'template' | 'package';
export type { ProjectTemplateDescriptor, ProjectTemplateId, ProjectTemplateKind };
export { PROJECT_TEMPLATES };

export interface ProjectCreationMeta {
  name: string;
  description: string;
  author: string;
  tags: string[];
}

export interface ProjectWizardDraft {
  mode: ProjectCreationMode;
  selectedTemplateId?: ProjectTemplateId;
  importedProject?: ProjectStructure;
  fileName?: string;
  importedFile?: File;
  meta: {
    name: string;
    description: string;
    author: string;
    tagsInput: string;
  };
  step: 0 | 1 | 2;
  busy: boolean;
  error: string;
}

function nowIso() {
  return new Date().toISOString();
}

export function parseTagInput(tagsInput: string): string[] {
  return tagsInput.split(',').map((item) => item.trim()).filter(Boolean);
}

function applyMeta(project: ProjectStructure, meta: ProjectCreationMeta): ProjectStructure {
  const now = nowIso();
  return normalizeProjectStructure({
    ...project,
    config: {
      ...project.config,
      id: `proj_${Date.now()}`,
      name: meta.name,
      description: meta.description,
      author: meta.author,
      tags: [...meta.tags],
      version: project.config.version || '2.0.0',
      createdAt: now,
      updatedAt: now,
    },
    settings: project.settings ? { ...project.settings, updatedAt: now } : undefined,
    forms: project.forms.map((form) => ({ ...form, updatedAt: now })),
    workflows: project.workflows.map((workflow) => ({ ...workflow, updatedAt: now })),
    globalBehaviors: project.globalBehaviors.map((behavior) => ({ ...behavior, updatedAt: now })),
  });
}

export function createBlankProject(meta: ProjectCreationMeta): ProjectStructure {
  return applyMeta(createNewProject(meta.name), meta);
}

export function createProjectFromTemplate(templateId: ProjectTemplateId, meta: ProjectCreationMeta): ProjectStructure {
  const now = nowIso();
  return normalizeProjectStructure(buildProjectTemplate(templateId, {
    id: `proj_${Date.now()}`,
    name: meta.name,
    description: meta.description,
    author: meta.author,
    tags: meta.tags,
    now,
  }) as ProjectStructure);
}

export async function createProjectFromPackage(file: File, meta: ProjectCreationMeta): Promise<ProjectStructure> {
  const imported = await importFormFlowPackage(file);
  if (!imported) throw new Error('无效的项目包文件');
  return applyMeta(imported, meta);
}

export async function createProjectFromSource(options:
  | { mode: 'blank'; meta: ProjectCreationMeta }
  | { mode: 'template'; templateId: ProjectTemplateId; meta: ProjectCreationMeta }
  | { mode: 'package'; file: File; meta: ProjectCreationMeta },
): Promise<ProjectStructure> {
  if (options.mode === 'blank') return createBlankProject(options.meta);
  if (options.mode === 'template') return createProjectFromTemplate(options.templateId, options.meta);
  return createProjectFromPackage(options.file, options.meta);
}
