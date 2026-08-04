// 必须在任何 React / React Router 代码运行前修复残缺的宿主 URLSearchParams，
// 否则 useSearchParams 会因 defaultSearchParams.forEach 缺失导致区域崩溃。
import './services/engine/urlSearchParamsShim';

import '@xyflow/react/dist/style.css';
import 'antd/dist/reset.css';
import './style/index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { Layout, ProjectsListPage, SystemSettingsLayout, SystemSettingsPage } from './pages/home';
import {
  ProjectDetailPage,
  WorkspaceLayout,
  ProjectSettingsLayout,
  DataPreviewPage,
  CanvasWithProvider,
  BehaviorPage,
  SettingsPage,
  FormDesignerPage,
  LegacyProjectRedirectPage,
  UsagePage,
  UnifiedEditorPage,
  TaskMonitorPage,
  DashboardPage,
  DataQualityPage,
  DataLineagePage,
  MetadataPage,
} from './pages/editor';
import { DocsPlatformPage } from './pages/doc';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginPage } from './pages/auth';
import { getSession } from './services/io/auth';
import { AppInteractionProvider } from './components/AppInteractionProvider';
import { resolveLegacyDocPath, type LegacyDocSection } from './services/io/routes';

const isCloudMode = ((import.meta as any).env?.VITE_APP_MODE || 'local') === 'cloud';
function ModeGate() {
  const location = useLocation();
  if (isCloudMode && !getSession()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Layout />;
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppInteractionProvider>
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ModeGate />}>
            <Route index element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsListPage />} />
            <Route path="/docs">
              <Route index element={<DocsPlatformPage home />} />
              <Route path="tasks/:slug" element={<DocsPlatformPage />} />
              <Route path="troubleshooting/:slug" element={<DocsPlatformPage />} />
              <Route path="cases/:slug" element={<DocsPlatformPage />} />
              <Route path="reference/:domain/:slug" element={<DocsPlatformPage />} />
              <Route path="overview" element={<LegacyDocsRedirect section="overview" />} />
              <Route path="overview/:slug" element={<LegacyDocsRedirect section="overview" />} />
              <Route path="behavior" element={<LegacyDocsRedirect section="behavior" />} />
              <Route path="behavior/:slug" element={<LegacyDocsRedirect section="behavior" />} />
              <Route path="form-design" element={<LegacyDocsRedirect section="form-design" />} />
              <Route path="form-design/:slug" element={<LegacyDocsRedirect section="form-design" />} />
              <Route path="flow-nodes" element={<LegacyDocsRedirect section="flow-nodes" />} />
              <Route path="flow-nodes/:slug" element={<LegacyDocsRedirect section="flow-nodes" />} />
              <Route path="backend" element={<LegacyDocsRedirect section="backend" />} />
              <Route path="backend/:slug" element={<LegacyDocsRedirect section="backend" />} />
            </Route>
            <Route path="/settings" element={<SystemSettingsLayout />}>
              <Route index element={<Navigate to="general" replace />} />
              <Route path=":section" element={<SystemSettingsPage />} />
            </Route>
            <Route path="/projects/:id" element={<ProjectDetailPage />}>
              <Route index element={<Navigate to="editor" replace />} />
              <Route path="editor" element={<UnifiedEditorPage />} />
              <Route path="usage" element={<UsagePage />} />
              <Route path="tasks" element={<TaskMonitorPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="quality" element={<DataQualityPage />} />
              <Route path="lineage" element={<DataLineagePage />} />
              <Route path="metadata" element={<MetadataPage />} />
              <Route path="workspace" element={<WorkspaceLayout />}>
                <Route index element={<WorkspaceEditorRedirect mode="data" />} />
                <Route path="data" element={<WorkspaceEditorRedirect mode="data" />} />
                <Route path="canvas" element={<WorkspaceEditorRedirect mode="flow" />} />
                <Route path="designer" element={<WorkspaceEditorRedirect mode="design" />} />
                <Route path="behavior" element={<WorkspaceEditorRedirect mode="behavior" />} />
                <Route path="test" element={<WorkspaceEditorRedirect mode="test" />} />
              </Route>
              <Route path="settings" element={<ProjectSettingsLayout />}>
                <Route index element={<Navigate to="general" replace />} />
                <Route path=":section" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="/project/:id/*" element={<LegacyProjectRedirectPage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Route>
          </Routes>
        </AppInteractionProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function AppThemeRoot() {
  const [darkMode, setDarkMode] = React.useState(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncAppearance = () => {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'dark') { setDarkMode(true); return; }
      if (attr === 'light') { setDarkMode(false); return; }
      setDarkMode(media.matches);
    };
    media.addEventListener('change', syncAppearance);
    // Also observe data-theme attribute changes
    const observer = new MutationObserver(syncAppearance);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', syncAppearance);
      observer.disconnect();
    };
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: darkMode ? '#0a84ff' : '#007aff',
          colorBgBase: darkMode ? '#1c1c1e' : '#ffffff',
          colorTextBase: darkMode ? '#f5f5f7' : '#1c1c1e',
          borderRadius: 12,
          controlHeight: 36,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
        },
      }}
    >
      <App />
    </ConfigProvider>
  );
}

function WorkspaceEditorRedirect({ mode }: { mode: 'data' | 'design' | 'behavior' | 'flow' | 'test' }) {
  const { id = '' } = useParams<{ id: string }>();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  if (mode === 'test') return <Navigate to={`/projects/${id}/usage?${query.toString()}`} replace />;
  query.set('mode', mode);
  return <Navigate to={`/projects/${id}/editor?${query.toString()}`} replace />;
}

function LegacyDocsRedirect({ section }: { section: LegacyDocSection }) {
  const { slug } = useParams<{ slug?: string }>();
  const location = useLocation();
  return <Navigate to={`${resolveLegacyDocPath(section, slug)}${location.search}`} replace />;
}

const root = createRoot(document.querySelector('#app') as HTMLElement);
root.render(
  <AppThemeRoot />,
);
