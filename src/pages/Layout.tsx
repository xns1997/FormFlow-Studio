import React from 'react';
import { Outlet, useLocation, useParams, Link } from 'react-router-dom';
import { useProjectStore } from '../project/store';
import { DesignerIcon } from '../designer/icons';

const projectNavItems = [
  { path: 'data', label: '数据预览', icon: 'data' },
  { path: 'canvas', label: '流程编排', icon: 'canvas' },
  { path: 'designer', label: '表单设计', icon: 'designer' },
  { path: 'behavior', label: '行为定义', icon: 'behavior' },
  { path: 'test', label: '测试运行', icon: 'test' },
  { path: 'settings', label: '设置', icon: 'settings' },
];

export default function Layout() {
  const location = useLocation();
  const { id: projectId } = useParams<{ id: string }>();
  const project = useProjectStore((s) => s.project);
  const isProjectView = !!projectId && location.pathname.startsWith(`/project/${projectId}`);

  return (
    <div className="app-layout">
      <nav className="app-nav">
        <div className="nav-brand">
          <Link to="/projects" className="nav-logo">FF</Link>
          <Link to="/projects" className="nav-title">FormFlow</Link>
        </div>
        <div className="nav-links">
          {isProjectView && project && (
            <>
              <Link to="/projects" className="nav-link">
                <DesignerIcon name="projects" className="nav-icon" />
                <span className="nav-label">项目列表</span>
              </Link>
              <span className="nav-divider">/</span>
              <span className="nav-project-name">{project.config.name}</span>
              {projectNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={`/project/${projectId}/${item.path}`}
                  className={`nav-link ${location.pathname.endsWith(`/${item.path}`) ? 'active' : ''}`}
                >
                  <DesignerIcon name={item.icon} className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                </Link>
              ))}
            </>
          )}
          {!isProjectView && (
            <Link to="/projects" className="nav-link active">
              <DesignerIcon name="projects" className="nav-icon" />
              <span className="nav-label">项目列表</span>
            </Link>
          )}
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
