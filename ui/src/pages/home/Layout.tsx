import React, { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import DocModal from '../../components/DocModal';
import { DesignerIcon } from '../../designer/icons';
import { useProjectStore } from '../../project/store';
import { useSystemSettingsStore } from '../../project/systemSettingsStore';
import {
  buildDocsPath,
  buildEditorPath,
  buildProjectSettingsPath,
  buildProjectsPath,
  buildSystemSettingsPath,
  buildWorkspacePath,
  type ProjectSettingsSection,
  type SystemSettingsSection,
} from '../../services/io/routes';
import { NotificationCenter } from '../../components/NotificationCenter';
import ProjectAgentDrawer from '../../components/ProjectAgentDrawer';

const homeNavItems = [
  { to: buildProjectsPath(), label: '项目列表', icon: 'projects', match: '/projects' },
  { to: buildSystemSettingsPath('general'), label: '系统设置', icon: 'settings', match: '/settings' },
];

const docNavItem = { to: buildDocsPath(), label: '文档', icon: 'docs', match: '/docs' };

const projectSettingsTabs: Array<{ section: ProjectSettingsSection; label: string; icon: string }> = [
  { section: 'general', label: '常规', icon: 'settings' },
  { section: 'versions', label: '版本', icon: 'projects' },
  { section: 'behavior', label: '行为', icon: 'behavior' },
  { section: 'publish', label: '发布', icon: 'upload' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.project);
  const { settings, initSettings } = useSystemSettingsStore();
  const [docOpen, setDocOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const match = location.pathname.match(/^\/projects\/([^/]+)/);
  const projectId = match?.[1] || '';
  const inWorkspace = !!projectId && (location.pathname.endsWith('/editor') || location.pathname.endsWith('/usage') || location.pathname.includes('/workspace/'));
  const inProjectSettings = !!projectId && location.pathname.includes('/settings/');
  const inSystemSettings = !projectId && location.pathname.startsWith('/settings');
  const currentProjectName = project && project.config.id === projectId ? project.config.name : '';
  const inUsage = location.pathname.endsWith('/usage');
  const projectSettingsTab = (location.pathname.split('/').pop() || 'general') as ProjectSettingsSection;

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  useEffect(() => {
    if (!settings.general.showClock) return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [settings.general.showClock]);

  useEffect(() => {
    const handleAppShortcuts = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== ',') return;
      event.preventDefault();
      let section: SystemSettingsSection = 'general';
      try {
        const remembered = localStorage.getItem('formflow.settings.lastSection');
        if (remembered && ['general', 'storage', 'editor', 'ai', 'experiments'].includes(remembered)) section = remembered as SystemSettingsSection;
      } catch { /* use default */ }
      navigate(buildSystemSettingsPath(section));
    };
    window.addEventListener('keydown', handleAppShortcuts);
    return () => window.removeEventListener('keydown', handleAppShortcuts);
  }, [navigate]);

  const clockText = useMemo(() => {
    if (!settings.general.showClock) return '';
    const datePart = settings.general.dateFormat === 'locale'
      ? now.toLocaleDateString(settings.general.language, { timeZone: settings.general.timezone })
      : (() => {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: settings.general.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(now);
        const year = parts.find((part) => part.type === 'year')?.value || '0000';
        const month = parts.find((part) => part.type === 'month')?.value || '00';
        const day = parts.find((part) => part.type === 'day')?.value || '00';
        const separator = settings.general.dateFormat === 'YYYY/MM/DD' ? '/' : '-';
        return `${year}${separator}${month}${separator}${day}`;
      })();
    const timePart = new Intl.DateTimeFormat(settings.general.language, {
      timeZone: settings.general.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: settings.general.showSeconds ? '2-digit' : undefined,
      hour12: !settings.general.use24Hour,
    }).format(now);
    return `${datePart} ${timePart}`;
  }, [now, settings.general.dateFormat, settings.general.language, settings.general.showClock, settings.general.showSeconds, settings.general.timezone, settings.general.use24Hour]);

  return (
    <div className="app-layout">
      <nav className="app-nav" aria-label="主导航">
        <div className="nav-brand">
          <Link to={buildProjectsPath()} className="nav-logo" aria-label="FormFlow 首页">
            <span aria-hidden="true">F</span>
          </Link>
          <Link to={buildProjectsPath()} className="nav-title">FormFlow</Link>
        </div>

        {projectId && (
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
        )}

        {projectId && (
          <div className="nav-context">
            <span className="nav-divider">/</span>
            <span className="nav-project-badge">{currentProjectName || `项目 ${projectId}`}</span>
            {inWorkspace && (
              <div className="nav-links nav-links-context">
                <Link to={buildEditorPath(projectId)} className={`nav-link ${!inUsage ? 'active' : ''}`}>
                  <DesignerIcon name="designer" className="nav-icon" />
                  <span className="nav-label">编辑工作台</span>
                </Link>
                <Link to={buildWorkspacePath(projectId, 'test')} className={`nav-link ${inUsage ? 'active' : ''}`}>
                  <DesignerIcon name="test" className="nav-icon" />
                  <span className="nav-label">测试运行</span>
                </Link>
                <Link to={buildProjectSettingsPath(projectId, 'general')} className="nav-link nav-link-subtle">
                  <DesignerIcon name="settings" className="nav-icon" />
                  <span className="nav-label">项目设置</span>
                </Link>
              </div>
            )}
            {inProjectSettings && (
              <div className="nav-links nav-links-context">
                <Link to={buildWorkspacePath(projectId, 'designer')} className="nav-link nav-link-subtle">
                  <DesignerIcon name="designer" className="nav-icon" />
                  <span className="nav-label">返回编辑器</span>
                </Link>
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
              </div>
            )}
          </div>
        )}

        {!projectId && inSystemSettings && (
          <div className="nav-context">
            <Link to={buildProjectsPath()} className="nav-link nav-back-link">
              <span aria-hidden="true">‹</span>
              <span className="nav-label">项目</span>
            </Link>
            <span className="nav-section-title">系统设置</span>
          </div>
        )}

        <div className="nav-links nav-links-doc">
          {!projectId && !inSystemSettings && (
              <Link to={buildSystemSettingsPath('general')} className="nav-link" aria-keyshortcuts="Meta+, Control+,">
              <DesignerIcon name="settings" className="nav-icon" />
              <span className="nav-label">设置</span>
            </Link>
          )}
          <NotificationCenter />
          {settings.general.showClock && (
            <div className="nav-status-clock" title={settings.general.timezone}>
              <DesignerIcon name="timePicker" className="nav-icon" />
              <span className="nav-status-clock-text">{clockText}</span>
            </div>
          )}
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
      <main className="app-main" id="main-content">
        <Outlet />
      </main>
      {projectId && <DocModal open={docOpen} onClose={() => setDocOpen(false)} />}
      <ProjectAgentDrawer projectId={projectId || undefined} />
    </div>
  );
}
