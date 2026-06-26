import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createNewProject, saveProjectStructure, listProjects,
  deleteProject as deleteProjectFn, importProjectFile,
} from '../project/manager';

export default function ProjectsListPage() {
  const navigate = useNavigate();
  const [projectList, setProjectList] = useState<Array<{ id: string; name: string; updatedAt: string; tableCount: number }>>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => { listProjects().then(setProjectList); }, []);

  const createProject = useCallback(async () => {
    const name = newName.trim() || `项目 ${projectList.length + 1}`;
    const project = createNewProject(name);
    await saveProjectStructure(project);
    const list = await listProjects();
    setProjectList(list);
    setNewName('');
    navigate(`/project/${project.config.id}`);
  }, [newName, projectList.length, navigate]);

  const openProject = useCallback((id: string) => {
    navigate(`/project/${id}`);
  }, [navigate]);

  const deleteProject = useCallback(async (id: string, name: string) => {
    if (confirm(`确定删除项目 "${name}"？`)) {
      await deleteProjectFn(id);
      const list = await listProjects();
      setProjectList(list);
    }
  }, []);

  const duplicateProject = useCallback(async (id: string, name: string) => {
    const data = await fetch(`http://localhost:3001/api/projects/${id}`).then((r) => r.json()).catch(() => null);
    if (!data) return;
    data.config.id = `proj_${Date.now()}`;
    data.config.name = `${name} (副本)`;
    data.config.createdAt = new Date().toISOString();
    data.config.updatedAt = new Date().toISOString();
    await saveProjectStructure(data);
    const list = await listProjects();
    setProjectList(list);
  }, []);

  const exportProject = useCallback((id: string, name: string) => {
    fetch(`http://localhost:3001/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.formflow.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }, []);

  const importProj = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const t = e.target as HTMLInputElement;
      if (t.files?.[0]) {
        try {
          const project = await importProjectFile(t.files[0]);
          await saveProjectStructure(project);
          const list = await listProjects();
          setProjectList(list);
          navigate(`/project/${project.config.id}`);
        } catch (err) { alert('导入失败: ' + String(err)); }
      }
    };
    input.click();
  }, [navigate]);

  return (
    <div className="page-container projects-page">
      <div className="page-header">
        <h2>所有项目</h2>
        <p>管理、创建、导入导出你的表单项目</p>
      </div>

      <div className="project-create-bar">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="输入项目名称…" onKeyDown={(e) => e.key === 'Enter' && createProject()} />
        <button className="primary" onClick={createProject}>新建项目</button>
        <button onClick={importProj}>导入项目</button>
      </div>

      <div className="projects-grid">
        {projectList.length === 0 ? (
          <div className="projects-empty">
            <div className="empty-icon">📁</div>
            <h3>还没有项目</h3>
            <p className="hint">点击「新建项目」开始，或「导入项目」加载已有项目</p>
          </div>
        ) : projectList.map((p) => (
          <div key={p.id} className="project-card" onClick={() => openProject(p.id)}>
            <div className="card-header">
              <span className="card-name">{p.name}</span>
            </div>
            <div className="card-stats">
              <span>{p.tableCount} 个数据表</span>
              <span>更新于 {new Date(p.updatedAt).toLocaleDateString()}</span>
            </div>
            <div className="card-actions" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => openProject(p.id)}>打开</button>
              <button onClick={() => duplicateProject(p.id, p.name)}>复制</button>
              <button onClick={() => exportProject(p.id, p.name)}>导出</button>
              <button className="danger" onClick={() => deleteProject(p.id, p.name)}>删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
