import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import DocModal from '../../components/DocModal';
import { DesignerIcon } from '../../designer/icons';
import { useProjectStore } from '../../project/store';
import {
  buildDocsPath,
  buildProjectSettingsPath,
  buildProjectsPath,
  buildSystemSettingsPath,
  buildWorkspacePath,
  type ProjectSettingsSection,
  type SystemSettingsSection,
  type WorkspaceTab,
} from '../../services/io/routes';

const homeNavItems = [
  { to: buildProjectsPath(), label: '项目列表', icon: 'projects', match: '/projects' },
  { to: buildSystemSettingsPath('general'), label: '系统设置', icon: 'settings', match: '/settings' },
];

const docNavItem = { to: buildDocsPath(), label: '文档', icon: 'docs', match: '/docs' };

const workspaceTabs: Array<{ tab: WorkspaceTab; label: string; icon: string }> = [
  { tab: 'data', label: '数据预览', icon: 'data' },
  { tab: 'canvas', label: '流程编辑', icon: 'canvas' },
  { tab: 'designer', label: '表单设计', icon: 'designer' },
  { tab: 'behavior', label: '行为定义', icon: 'behavior' },
  { tab: 'test', label: '测试运行', icon: 'test' },
];

const projectSettingsTabs: Array<{ section: ProjectSettingsSection; label: string; icon: string }> = [
  { section: 'general', label: '常规', icon: 'settings' },
  { section: 'versions', label: '版本', icon: 'projects' },
  { section: 'behavior', label: '行为', icon: 'behavior' },
  { section: 'publish', label: '发布', icon: 'upload' },
];

const systemSettingsTabs: Array<{ section: SystemSettingsSection; label: string; icon: string }> = [
  { section: 'general', label: '常规', icon: 'settings' },
  { section: 'storage', label: '存储', icon: 'upload' },
  { section: 'editor', label: '编辑器', icon: 'design' },
  { section: 'experiments', label: '实验功能', icon: 'test' },
];

export default function Layout() {
  const location = useLocation();
  const project = useProjectStore((s) => s.project);
  const [docOpen, setDocOpen] = useState(false);
  const match = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = match?.[1] || '';
  const inWorkspace = !!projectId && location.pathname.includes('/workspace/');
  const inProjectSettings = !!projectId && location.pathname.includes('/settings/');
  const inSystemSettings = !projectId && location.pathname.startsWith('/settings');
  const currentProjectName = project && project.config.id === projectId ? project.config.name : '';
  const workspaceTab = (location.pathname.split('/').pop() || 'data') as WorkspaceTab;
  const projectSettingsTab = (location.pathname.split('/').pop() || 'general') as ProjectSettingsSection;
  const systemSettingsTab = (location.pathname.split('/').pop() || 'general') as SystemSettingsSection;

  return (
    <div className="app-layout">
      <nav className="app-nav">
        <div className="nav-brand">
          <Link to={buildProjectsPath()} className="nav-logo">FF</Link>
          <Link to={buildProjectsPath()} className="nav-title">FormFlow</Link>
        </div>

        <div className="nav-links nav-links-home">
          {homeNavItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-link ${location.pathname.startsWith(item.match) ? 'active' : ''}`}
            >
              <DesignerIcon name={item.icon} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </div>

        {projectId && (
          <div className="nav-context">
            <span className="nav-divider">/</span>
            <span className="nav-project-badge">{currentProjectName || `项目 ${projectId}`}</span>
            {inWorkspace && (
              <div className="nav-links nav-links-context">
                {workspaceTabs.map((item) => (
                  <Link
                    key={item.tab}
                    to={buildWorkspacePath(projectId, item.tab)}
                    className={`nav-link ${workspaceTab === item.tab ? 'active' : ''}`}
                  >
                    <DesignerIcon name={item.icon} className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                ))}
                <Link to={buildProjectSettingsPath(projectId, 'general')} className="nav-link nav-link-subtle">
                  <DesignerIcon name="settings" className="nav-icon" />
                  <span className="nav-label">项目设置</span>
                </Link>
              </div>
            )}
            {inProjectSettings && (
              <div className="nav-links nav-links-context">
                {projectSettingsTabs.map((item) => (
                  <Link
                    key={item.section}
                    to={buildProjectSettingsPath(projectId, item.section)}
                    className={`nav-link ${projectSettingsTab === item.section ? 'active' : ''}`}
                  >
                    <DesignerIcon name={item.icon} className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                ))}
                <Link to={buildWorkspacePath(projectId, 'data')} className="nav-link nav-link-subtle">
                  <DesignerIcon name="canvas" className="nav-icon" />
                  <span className="nav-label">工作区</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {!projectId && inSystemSettings && (
          <div className="nav-context">
            <span className="nav-divider">/</span>
            <div className="nav-links nav-links-context">
              {systemSettingsTabs.map((item) => (
                <Link
                  key={item.section}
                  to={buildSystemSettingsPath(item.section)}
                  className={`nav-link ${systemSettingsTab === item.section ? 'active' : ''}`}
                >
                  <DesignerIcon name={item.icon} className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="nav-links nav-links-doc">
          {projectId ? (
            <button
              type="button"
              className={`nav-link ${docOpen ? 'active' : ''}`}
              onClick={() => setDocOpen(true)}
            >
              <DesignerIcon name={docNavItem.icon} className="nav-icon" />
              <span className="nav-label">{docNavItem.label}</span>
            </button>
          ) : (
            <Link
              to={docNavItem.to}
              className={`nav-link ${location.pathname.startsWith(docNavItem.match) ? 'active' : ''}`}
            >
              <DesignerIcon name={docNavItem.icon} className="nav-icon" />
              <span className="nav-label">{docNavItem.label}</span>
            </Link>
          )}
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
      {projectId && <DocModal open={docOpen} onClose={() => setDocOpen(false)} />}
    </div>
  );
}
