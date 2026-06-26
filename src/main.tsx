import '@xyflow/react/dist/style.css';
import './style/index.css';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './pages/Layout';
import ProjectsListPage from './pages/ProjectsListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import DataPreviewPage from './pages/DataPreviewPage';
import { CanvasWithProvider } from './pages/CanvasPage';
import BehaviorPage from './pages/BehaviorPage';
import TestPage from './pages/TestPage';
import SettingsPage from './pages/SettingsPage';
import FormDesignerPage from './pages/FormDesignerPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/projects" element={<ProjectsListPage />} />
          <Route path="/project/:id" element={<ProjectDetailPage />}>
            <Route index element={<Navigate to="data" replace />} />
            <Route path="data" element={<DataPreviewPage />} />
            <Route path="canvas" element={<CanvasWithProvider />} />
            <Route path="designer" element={<FormDesignerPage />} />
            <Route path="behavior" element={<BehaviorPage />} />
            <Route path="test" element={<TestPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

const root = createRoot(document.querySelector('#app') as HTMLElement);
root.render(<App />);
