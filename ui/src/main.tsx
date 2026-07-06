import '@xyflow/react/dist/style.css';
import 'antd/dist/reset.css';
import './style/index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
} from './pages/editor';
import { BehaviorDocsPage } from './pages/doc';
import { ErrorBoundary } from './components/ErrorBoundary';
import UnifiedEditorPage from './pages/UnifiedEditorPage';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsListPage />} />
            <Route path="/docs">
              <Route index element={<BehaviorDocsPage />} />
              <Route path=":slug" element={<BehaviorDocsPage />} />
            </Route>
            <Route path="/settings" element={<SystemSettingsLayout />}>
              <Route index element={<Navigate to="general" replace />} />
              <Route path=":section" element={<SystemSettingsPage />} />
            </Route>
            <Route path="/projects/:id" element={<ProjectDetailPage />}>
              <Route index element={<Navigate to="editor" replace />} />
              <Route path="editor" element={<UnifiedEditorPage />} />
              <Route path="usage" element={<UsagePage />} />
              <Route path="workspace" element={<WorkspaceLayout />}>
                <Route index element={<Navigate to="data" replace />} />
                <Route path="data" element={<DataPreviewPage />} />
                <Route path="canvas" element={<CanvasWithProvider />} />
                <Route path="designer" element={<FormDesignerPage />} />
                <Route path="behavior" element={<BehaviorPage />} />
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
      </BrowserRouter>
    </ErrorBoundary>
  );
}

const root = createRoot(document.querySelector('#app') as HTMLElement);
root.render(<App />);
