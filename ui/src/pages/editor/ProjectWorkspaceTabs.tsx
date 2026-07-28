import React from 'react';
import { useNavigate } from 'react-router-dom';
import { buildWorkspacePath, type WorkspaceTab } from '../../services/io/routes';

export type ProjectWorkspaceMode = 'data' | 'template' | 'design' | 'behavior' | 'flow' | 'test' | 'settings';

const tabs: Array<{ mode: ProjectWorkspaceMode; label: string; routeTab?: WorkspaceTab }> = [
  { mode: 'data', label: '数据预览', routeTab: 'data' },
  { mode: 'design', label: '表单设计', routeTab: 'designer' },
  { mode: 'behavior', label: '行为定义', routeTab: 'behavior' },
  { mode: 'flow', label: '流程编排', routeTab: 'canvas' },
  { mode: 'test', label: '测试运行', routeTab: 'test' },
  { mode: 'settings', label: '项目设置', routeTab: 'settings' },
];

interface ProjectWorkspaceTabsProps {
  projectId: string;
  projectName?: string;
  activeMode: ProjectWorkspaceMode;
  onModeChange?: (mode: Exclude<ProjectWorkspaceMode, 'test'>) => void;
}

export default function ProjectWorkspaceTabs({
  projectId,
  projectName,
  activeMode,
  onModeChange,
}: ProjectWorkspaceTabsProps) {
  const navigate = useNavigate();
  const title = projectName?.trim() || `项目 ${projectId}`;

  const selectMode = (mode: ProjectWorkspaceMode, routeTab?: WorkspaceTab) => {
    if (mode !== 'test' && onModeChange) {
      onModeChange(mode);
      return;
    }
    if (routeTab) navigate(buildWorkspacePath(projectId, routeTab));
  };

  return (
    <div className="project-workspace-navigation">
      <div className="project-workspace-title" title={title} aria-label={`当前项目：${title}`}>
        <span>{title}</span>
      </div>
      <nav className="project-workspace-links" aria-label="项目工作区">
        {tabs.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            aria-current={activeMode === tab.mode ? 'page' : undefined}
            className={`project-workspace-link ${tab.mode === 'test' ? 'route-separated' : ''} ${activeMode === tab.mode ? 'active' : ''}`}
            onClick={() => selectMode(tab.mode, tab.routeTab)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
