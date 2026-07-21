import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { notification } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  createProjectStructure, listProjects,
  cloneProject, deleteProject as deleteProjectFn, loadProjectStructure,
} from '../../project/manager';
import { downloadFormFlowPackage, importFormFlowPackage, openFilePicker } from '../../project/packageManager';
import { request } from '../../services/io/api';
import Modal, { ModalFooter, ModalHeader } from '../../components/Modal';
import {
  PROJECT_TEMPLATES,
  createProjectFromSource,
  parseTagInput,
  type ProjectCreationMode,
  type ProjectCreationMeta,
  type ProjectTemplateId,
  type ProjectWizardDraft,
} from '../../project/creation';
import { useProjectStore } from '../../project/store';
import { buildProjectPath, buildWorkspacePath, buildEditorPath, buildUsagePath } from '../../services/io/routes';
import type { ProjectStructure } from '../../project/types';
import { ShareDialog } from '../../components/ShareDialog';
import { getSession } from '../../services/io/auth';
import { useAppInteraction } from '../../components/AppInteractionProvider';

function createInitialDraft(): ProjectWizardDraft {
  return {
    mode: 'blank',
    meta: {
      name: '',
      description: '',
      author: '',
      tagsInput: '',
    },
    step: 0,
    busy: false,
    error: '',
  };
}

function nextStep(step: ProjectWizardDraft['step']): ProjectWizardDraft['step'] {
  if (step === 0) return 1;
  if (step === 1) return 2;
  return 2;
}

function prevStep(step: ProjectWizardDraft['step']): ProjectWizardDraft['step'] {
  if (step === 2) return 1;
  if (step === 1) return 0;
  return 0;
}

type ViewMode = 'grid' | 'list' | 'compact';

const PROJECT_GRADIENTS = [
  { bg: [238, 244, 255], blobs: [[147, 180, 248, -10, 20, 120, 60], [196, 181, 253, 80, 70, 130, 90], [165, 243, 252, 40, 100, 100, 70]] },
  { bg: [245, 240, 255], blobs: [[196, 181, 253, 15, 10, 110, 80], [240, 171, 252, 85, 50, 120, 70], [147, 197, 253, 50, 95, 100, 80]] },
  { bg: [236, 253, 245], blobs: [[110, 231, 183, 20, 15, 120, 70], [165, 243, 252, 80, 60, 110, 80], [253, 230, 138, 45, 100, 90, 60]] },
  { bg: [254, 249, 236], blobs: [[253, 230, 138, 10, 20, 120, 80], [252, 165, 165, 85, 55, 110, 70], [167, 243, 208, 40, 95, 100, 70]] },
  { bg: [254, 242, 242], blobs: [[252, 165, 165, 20, 15, 130, 80], [251, 207, 232, 75, 55, 110, 70], [253, 230, 138, 50, 100, 90, 60]] },
  { bg: [253, 242, 248], blobs: [[251, 207, 232, 10, 20, 120, 70], [196, 181, 253, 85, 50, 130, 90], [153, 246, 228, 40, 100, 100, 70]] },
  { bg: [240, 249, 255], blobs: [[147, 197, 253, 15, 10, 120, 80], [165, 243, 252, 80, 55, 110, 70], [196, 181, 253, 45, 100, 100, 80]] },
  { bg: [245, 243, 255], blobs: [[167, 139, 250, 20, 15, 130, 80], [240, 171, 252, 75, 50, 120, 70], [103, 232, 249, 50, 95, 100, 70]] },
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getProjectGradient(name: string): string {
  const g = PROJECT_GRADIENTS[hashName(name) % PROJECT_GRADIENTS.length];
  const [br, bg, bb] = g.bg;
  const layers = g.blobs.map(([r, b, gb, x, y, rx, ry]) =>
    `ellipse ${rx}% ${ry}% at ${x}% ${y}%, rgba(${r},${b},${gb},0.6) 0%, rgba(${r},${b},${gb},0) 100%`,
  );
  return `radial-gradient(${layers[0]}), radial-gradient(${layers[1]}), radial-gradient(${layers[2]}), rgb(${br},${bg},${bb})`;
}

function formatProjectDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知时间' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ProjectsListPage() {
  const navigate = useNavigate();
  const { confirm, announce } = useAppInteraction();
  const setProject = useProjectStore((s) => s.setProject);
  const [projectList, setProjectList] = useState<Array<{ id: string; name: string; updatedAt: string; tableCount: number; shared?: boolean }>>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draft, setDraft] = useState<ProjectWizardDraft>(createInitialDraft());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [projectTab, setProjectTab] = useState<'all' | 'shared'>('all');
  const [sharedList, setSharedList] = useState<Array<{ id: string; name: string; updatedAt: string; tableCount: number; shared?: boolean }>>([]);
  const [shareDialogProject, setShareDialogProject] = useState<{ id: string; name: string } | null>(null);
  const isCloudMode = ((import.meta as any).env?.VITE_APP_MODE || 'local') === 'cloud';

  useEffect(() => { listProjects().then(setProjectList).catch(() => {}); }, []);
  useEffect(() => {
    if (isCloudMode && getSession()) {
      request('/projects/shared-with-me').then(setSharedList).catch(() => {});
    }
  }, [isCloudMode]);

  const filteredList = useMemo(() => {
    const source = projectTab === 'shared' ? sharedList : projectList;
    if (!searchQuery.trim()) return source;
    const q = searchQuery.toLowerCase();
    return source.filter((p) => p.name.toLowerCase().includes(q));
  }, [projectList, sharedList, searchQuery, projectTab]);

  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    setDraft(createInitialDraft());
  }, []);

  const openWizard = useCallback(() => {
    setWizardOpen(true);
    setDraft(createInitialDraft());
  }, []);

  const openProject = useCallback((id: string) => {
    navigate(buildProjectPath(id));
  }, [navigate]);

  const deleteProject = useCallback(async (id: string, name: string) => {
    if (!await confirm({
      title: '删除项目？',
      message: `确定删除“${name}”？`,
      detail: '此操作会永久移除项目及其本地数据，无法撤销。',
      confirmLabel: '删除项目',
      destructive: true,
    })) return;
    try {
      await deleteProjectFn(id);
      setProjectList(await listProjects());
      announce(`已删除项目“${name}”`);
    } catch (error) {
      const description = error instanceof Error ? error.message : String(error);
      notification.error({ message: '删除项目失败', description });
      announce('删除项目失败');
    }
  }, [announce, confirm]);

  const duplicateProject = useCallback(async (id: string, name: string) => {
    await cloneProject(id);
    const list = await listProjects();
    setProjectList(list);
  }, []);

  const exportProject = useCallback((id: string) => {
    loadProjectStructure(id)
      .then((data) => data && downloadFormFlowPackage(data));
  }, []);

  const finishCreate = useCallback(async (projectPromise: Promise<ProjectStructure>) => {
    const project = await projectPromise;
    await createProjectStructure(project);
    await setProject(project);
    try { setProjectList(await listProjects()); } catch {}
    navigate(buildWorkspacePath(project.config.id));
  }, [navigate, setProject]);

  const importPackage = useCallback(async () => {
    const file = await openFilePicker('.formflow');
    if (!file) return;
    try {
      await finishCreate(createProjectFromSource({
        mode: 'package',
        file,
        meta: {
          name: file.name.replace(/\.formflow$/i, '') || `导入项目 ${projectList.length + 1}`,
          description: '',
          author: '',
          tags: [],
        },
      }));
    } catch (err) {
      const description = err instanceof Error ? err.message : String(err);
      notification.error({ message: '导入项目包失败', description });
      announce('导入项目包失败');
    }
  }, [announce, finishCreate, projectList.length]);

  const setMode = useCallback((mode: ProjectCreationMode) => {
    setDraft((current) => ({
      ...current,
      mode,
      selectedTemplateId: mode === 'template' ? current.selectedTemplateId : undefined,
      importedProject: mode === 'package' ? current.importedProject : undefined,
      importedFile: mode === 'package' ? current.importedFile : undefined,
      fileName: mode === 'package' ? current.fileName : undefined,
      error: '',
    }));
  }, []);

  const setMetaField = useCallback((field: keyof ProjectWizardDraft['meta'], value: string) => {
    setDraft((current) => ({
      ...current,
      meta: { ...current.meta, [field]: value },
    }));
  }, []);

  const chooseTemplate = useCallback((templateId: ProjectTemplateId) => {
    const template = PROJECT_TEMPLATES.find((item) => item.id === templateId);
    setDraft((current) => ({
      ...current,
      selectedTemplateId: templateId,
      error: '',
      meta: {
        ...current.meta,
        name: current.meta.name || template?.name || '',
        description: current.meta.description || template?.description || '',
        tagsInput: current.meta.tagsInput || (template ? template.highlights[0] : ''),
      },
    }));
  }, []);

  const choosePackageFile = useCallback(async () => {
    const file = await openFilePicker('.formflow');
    if (!file) return;
    setDraft((current) => ({ ...current, busy: true, error: '' }));
    try {
      const importedProject = await importFormFlowPackage(file);
      if (!importedProject) throw new Error('无效的项目包文件');
      setDraft((current) => ({
        ...current,
        mode: 'package',
        busy: false,
        importedProject,
        importedFile: file,
        fileName: file.name,
        error: '',
        meta: {
          ...current.meta,
          name: current.meta.name || importedProject.config.name || file.name.replace(/\.formflow$/i, ''),
          description: current.meta.description || importedProject.config.description || '',
          author: current.meta.author || importedProject.config.author || '',
          tagsInput: current.meta.tagsInput || importedProject.config.tags.join(', '),
        },
      }));
    } catch (error) {
      setDraft((current) => ({
        ...current,
        busy: false,
        importedProject: undefined,
        importedFile: undefined,
        fileName: file.name,
        error: error instanceof Error ? error.message : '项目包校验失败',
      }));
    }
  }, []);

  const canMoveNext = draft.step === 0
    ? (draft.mode === 'blank'
      || (draft.mode === 'template' && !!draft.selectedTemplateId)
      || (draft.mode === 'package' && !!draft.importedProject && !draft.error))
    : draft.step === 1
      ? !!draft.meta.name.trim()
      : true;

  const moveNext = useCallback(() => {
    if (!canMoveNext) return;
    setDraft((current) => ({ ...current, step: nextStep(current.step) }));
  }, [canMoveNext]);

  const movePrev = useCallback(() => {
    setDraft((current) => ({ ...current, step: prevStep(current.step) }));
  }, []);

  const submitWizard = useCallback(async () => {
    const name = draft.meta.name.trim();
    if (!name) {
      setDraft((current) => ({ ...current, error: '请输入项目名称', step: 1 }));
      return;
    }
    setDraft((current) => ({ ...current, busy: true, error: '' }));
    try {
      const meta: ProjectCreationMeta = {
        name,
        description: draft.meta.description.trim(),
        author: draft.meta.author.trim(),
        tags: parseTagInput(draft.meta.tagsInput),
      };
      let projectPromise: Promise<ProjectStructure>;
      if (draft.mode === 'blank') {
        projectPromise = createProjectFromSource({ mode: 'blank', meta });
      } else if (draft.mode === 'template') {
        projectPromise = createProjectFromSource({ mode: 'template', templateId: draft.selectedTemplateId || 'game_analytics', meta });
      } else {
        if (!draft.importedFile) throw new Error('请先选择 .formflow 项目包');
        projectPromise = createProjectFromSource({ mode: 'package', file: draft.importedFile, meta });
      }
      await finishCreate(projectPromise);
      closeWizard();
    } catch (error) {
      setDraft((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : '创建项目失败',
      }));
    }
  }, [closeWizard, draft, finishCreate]);

  const template = PROJECT_TEMPLATES.find((item) => item.id === draft.selectedTemplateId);
  const summaryLines = [
    draft.mode === 'blank' ? '从空白项目开始' : draft.mode === 'template' ? `从模板「${template?.name || ''}」开始` : `从 .formflow 项目包「${draft.fileName || ''}」导入并解包`,
    draft.meta.description.trim() || '未填写项目描述',
    draft.meta.author.trim() ? `作者：${draft.meta.author.trim()}` : '作者未填写',
    parseTagInput(draft.meta.tagsInput).length > 0 ? `标签：${parseTagInput(draft.meta.tagsInput).join('、')}` : '标签未填写',
  ];

  return (
    <div className="page-container projects-page">
      <div className="page-header">
        <h2>所有项目</h2>
        <p>管理、创建、导入导出你的表单项目</p>
      </div>

      {isCloudMode && (
        <div className="projects-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" className={`ui-btn ${projectTab === 'all' ? 'ui-btn-primary' : ''}`} onClick={() => setProjectTab('all')}>我的项目</button>
          <button type="button" className={`ui-btn ${projectTab === 'shared' ? 'ui-btn-primary' : ''}`} onClick={() => setProjectTab('shared')}>共享给我的</button>
        </div>
      )}

      <div className="projects-toolbar">
        <div className="projects-toolbar-left">
          <button type="button" className="ui-btn ui-btn-primary" onClick={openWizard}>新建项目</button>
          <button type="button" className="ui-btn" onClick={importPackage}>导入项目包</button>
        </div>
        <div className="projects-toolbar-right">
          <div className="projects-search">
            <span className="projects-search-icon" aria-hidden="true">⌕</span>
            <input
              type="text"
              aria-label="搜索项目"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索项目…"
            />
            {searchQuery && (
              <button type="button" className="projects-search-clear" aria-label="清除搜索" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>
          <div className="projects-view-toggle">
            <button
              type="button"
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
              title="网格视图"
              aria-label="网格视图"
              aria-pressed={viewMode === 'grid'}
            >
              ⊞
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              title="列表视图"
              aria-label="列表视图"
              aria-pressed={viewMode === 'list'}
            >
              ☰
            </button>
            <button
              type="button"
              className={viewMode === 'compact' ? 'active' : ''}
              onClick={() => setViewMode('compact')}
              title="紧凑视图"
              aria-label="紧凑视图"
              aria-pressed={viewMode === 'compact'}
            >
              ⊟
            </button>
          </div>
        </div>
      </div>

      <div className={`projects-${viewMode}`}>
        {filteredList.length === 0 ? (
          <div className="projects-empty">
            <h3>{searchQuery ? '没有匹配的项目' : '还没有项目'}</h3>
            <p className="hint">{searchQuery ? '尝试其他关键词' : '点击「新建项目」开始，或「导入项目」加载已有项目'}</p>
          </div>
        ) : filteredList.map((p) => (
          <article
            key={p.id}
            className={`project-card project-card-${viewMode}`}
          >
            <div className="card-cover" style={{ background: getProjectGradient(p.name) }} aria-hidden="true">
              <span>{p.name.trim().slice(0, 1) || '项'}</span>
            </div>
            <div className="card-body">
              <div className="card-header">
                <button type="button" className="card-name card-name-button" onClick={() => openProject(p.id)}>{p.name}</button>
                {p.shared && <span className="project-shared-badge">共享</span>}
              </div>
              <div className="card-stats">
                <span>{p.tableCount} 个数据表</span>
                <span>更新于 {formatProjectDate(p.updatedAt)}</span>
              </div>
              {viewMode !== 'compact' && (
                <div className="card-footer">
                  <div className="card-modes">
                    <button type="button" className="card-mode-btn" onClick={() => navigate(buildUsagePath(p.id))}>直接使用</button>
                  </div>
                  <div className="card-actions">
                    <button type="button" className="ui-btn ui-btn-xs" onClick={() => openProject(p.id)}>打开</button>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={() => duplicateProject(p.id, p.name)}>复制</button>
                    <button type="button" className="ui-btn ui-btn-xs" onClick={() => exportProject(p.id)}>导出</button>
                    {isCloudMode && <button type="button" className="ui-btn ui-btn-xs" onClick={() => setShareDialogProject({ id: p.id, name: p.name })}>共享</button>}
                    <button type="button" className="ui-btn ui-btn-danger ui-btn-xs" onClick={() => deleteProject(p.id, p.name)}>删除</button>
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      <Modal open={wizardOpen} onClose={closeWizard} maxWidth={880}>
        <ModalHeader title="创建项目向导" onClose={closeWizard} />
        <div className="modal-body project-wizard-body">
          <div className="project-wizard-steps">
            {['起始方式', '基础信息', '确认创建'].map((label, index) => (
              <div key={label} className={`project-wizard-step ${draft.step === index ? 'active' : draft.step > index ? 'done' : ''}`}>
                <span>{index + 1}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>

          {draft.step === 0 && (
            <div className="project-wizard-panel">
              <div className="project-wizard-mode-grid">
                {[
                  { mode: 'blank' as const, title: '空白项目', desc: '快速创建一个最小项目，不预装模板内容。' },
                  { mode: 'template' as const, title: '内置模板', desc: '从轻量模板起步，带基础骨架和示例结构。' },
                  { mode: 'package' as const, title: '.formflow 导入', desc: '选择单文件项目包，校验后自动解包到项目存储目录。' },
                ].map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    className={`project-wizard-mode-card ${draft.mode === item.mode ? 'active' : ''}`}
                    onClick={() => setMode(item.mode)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.desc}</span>
                  </button>
                ))}
              </div>

              {draft.mode === 'template' && (
                <div className="project-wizard-template-grid">
                  {PROJECT_TEMPLATES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`project-wizard-template-card ${draft.selectedTemplateId === item.id ? 'active' : ''}`}
                      onClick={() => chooseTemplate(item.id)}
                    >
                      <div className="project-wizard-template-head">
                        <strong>{item.name}</strong>
                        <span>{item.kind}</span>
                      </div>
                      <p>{item.description}</p>
                      <div className="project-wizard-tags">
                        {item.highlights.map((highlight) => <span key={highlight}>{highlight}</span>)}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {draft.mode === 'package' && (
                <div className="project-wizard-import-box">
                  <button type="button" className="ui-btn ui-btn-primary" onClick={choosePackageFile} disabled={draft.busy}>
                    {draft.busy ? '正在校验 .formflow…' : '选择 .formflow 项目包'}
                  </button>
                  <p>{draft.fileName ? `已选择：${draft.fileName}` : '尚未选择文件'}</p>
                  {draft.importedProject && <p className="project-wizard-valid">已识别项目：{draft.importedProject.config.name}</p>}
                </div>
              )}
            </div>
          )}

          {draft.step === 1 && (
            <div className="project-wizard-panel project-wizard-form">
              <label>
                <span>项目名称</span>
                <input
                  value={draft.meta.name}
                  onChange={(e) => setMetaField('name', e.target.value)}
                  placeholder="例如：销售审批中心"
                />
              </label>
              <label>
                <span>项目描述</span>
                <textarea
                  value={draft.meta.description}
                  onChange={(e) => setMetaField('description', e.target.value)}
                  placeholder="一句话说明这个项目要解决的问题"
                  rows={4}
                />
              </label>
              <div className="project-wizard-form-grid">
                <label>
                  <span>作者</span>
                  <input
                    value={draft.meta.author}
                    onChange={(e) => setMetaField('author', e.target.value)}
                    placeholder="例如：运营团队"
                  />
                </label>
                <label>
                  <span>标签</span>
                  <input
                    value={draft.meta.tagsInput}
                    onChange={(e) => setMetaField('tagsInput', e.target.value)}
                    placeholder="用逗号分隔，如：审批, 销售, 模板"
                  />
                </label>
              </div>
            </div>
          )}

          {draft.step === 2 && (
            <div className="project-wizard-panel project-wizard-summary">
              <div className="project-wizard-summary-card">
                <strong>{draft.meta.name.trim() || '未命名项目'}</strong>
                <div className="project-wizard-summary-list">
                  {summaryLines.map((line) => <p key={line}>{line}</p>)}
                </div>
              </div>
              {draft.mode === 'template' && template && (
                <div className="project-wizard-summary-card subtle">
                  <strong>模板内容</strong>
                  <p>{template.description}</p>
                  <div className="project-wizard-tags">
                    {template.highlights.map((highlight) => <span key={highlight}>{highlight}</span>)}
                  </div>
                </div>
              )}
              {draft.mode === 'package' && draft.fileName && (
                <div className="project-wizard-summary-card subtle">
                  <strong>导入来源</strong>
                  <p>{draft.fileName}</p>
                </div>
              )}
            </div>
          )}

          {draft.error && <div className="project-wizard-error">{draft.error}</div>}
        </div>
        <ModalFooter>
          <button type="button" className="ui-btn" onClick={closeWizard} disabled={draft.busy}>取消</button>
          <button type="button" className="ui-btn" onClick={movePrev} disabled={draft.busy || draft.step === 0}>上一步</button>
          {draft.step < 2 ? (
            <button type="button" className="ui-btn ui-btn-primary" onClick={moveNext} disabled={draft.busy || !canMoveNext}>下一步</button>
          ) : (
            <button type="button" className="ui-btn ui-btn-primary" onClick={submitWizard} disabled={draft.busy}>
              {draft.busy ? '创建中…' : '创建并进入项目'}
            </button>
          )}
        </ModalFooter>
      </Modal>
      {shareDialogProject && (
        <ShareDialog
          projectId={shareDialogProject.id}
          projectName={shareDialogProject.name}
          open={!!shareDialogProject}
          onClose={() => setShareDialogProject(null)}
        />
      )}
    </div>
  );
}
