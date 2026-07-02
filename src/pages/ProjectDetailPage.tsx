import React, { useEffect, useRef } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useProjectStore } from '../project/store';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, loading, initProject } = useProjectStore();
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (id && initializedFor.current !== id) {
      initializedFor.current = id;
      initProject(id);
    }
  }, [id, initProject]);

  useEffect(() => {
    if (!loading && !project && id) navigate('/projects');
  }, [loading, project, id, navigate]);

  if (loading) return <div className="loading-splash"><div className="loading-spinner" /><p>加载项目…</p></div>;
  if (!project) return <div className="loading-splash"><p>项目不存在</p><button onClick={() => navigate('/projects')}>返回列表</button></div>;
  return <Outlet />;
}
