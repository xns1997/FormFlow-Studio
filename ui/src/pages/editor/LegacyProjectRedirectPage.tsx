import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { buildDocsPath, buildProjectSettingsPath, buildProjectPath, buildWorkspacePath } from '../../services/io/routes';

function resolveLegacyPath(projectId: string, splat: string | undefined, search: string) {
  const tail = (splat || '').replace(/^\/+/, '');
  if (!tail) return `${buildProjectPath(projectId)}${search}`;
  const [head, ...rest] = tail.split('/');
  if (head === 'settings') return `${buildProjectSettingsPath(projectId, 'general')}${search}`;
  if (head === 'docs') {
    const slug = rest[0];
    return buildDocsPath(slug, { fromProject: projectId, fromPage: 'workspace', fromTab: 'behavior' });
  }
  if (head === 'data' || head === 'canvas' || head === 'designer' || head === 'behavior' || head === 'test') {
    return `${buildWorkspacePath(projectId, head)}${search}`;
  }
  return `${buildProjectPath(projectId)}${search}`;
}

export default function LegacyProjectRedirectPage() {
  const { id = '', '*': splat } = useParams<{ id: string; '*': string }>();
  const location = useLocation();
  return <Navigate to={resolveLegacyPath(id, splat, location.search)} replace />;
}
