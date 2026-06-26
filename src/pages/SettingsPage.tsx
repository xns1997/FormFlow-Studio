import React, { useState, useCallback, useEffect } from 'react';
import { useProjectStore } from '../project/store';
import { saveProjectStructure } from '../project/manager';
import { createVersion, getVersions, restoreVersion, type ProjectVersion } from '../services/projectManager';
import type { ProjectStructure } from '../project/types';
import { DesignerIcon } from '../designer/icons';

export default function SettingsPage() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const [saved, setSaved] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [versionLabel, setVersionLabel] = useState('');

  useEffect(() => {
    if (project) setVersions(getVersions(project.config.id));
  }, [project]);

  const updateField = useCallback((path: string, value: unknown) => {
    if (!project) return;
    const next = { ...project, config: { ...project.config, updatedAt: new Date().toISOString() } };
    const keys = path.split('.');
    let obj: any = next;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    setProject(next);
  }, [project, setProject]);

  const save = useCallback(async () => {
    if (project) { await setProject(project); setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }, [project, setProject]);

  const saveVersion = useCallback(() => {
    if (!project) return;
    const ver = createVersion(project as any, versionLabel || `版本 ${versions.length + 1}`);
    setVersions(getVersions(project.config.id));
    setVersionLabel('');
  }, [project, versionLabel, versions]);

  const restoreVer = useCallback((versionId: string) => {
    if (!project) return;
    const restored = restoreVersion(project.config.id, versionId);
    if (restored) setProject(restored as any);
  }, [project, setProject]);

  if (!project) return <div className="loading-splash"><p>未选择项目</p></div>;

  return (
    <div className="page-layout">
      {/* 左侧：设置分类 */}
      <div className="page-sidebar">
        <div className="page-section-header">
          <span>设置</span>
          <button onClick={save} style={{ padding: '2px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: saved ? '#dcfce7' : 'var(--panel)' }}>{saved ? '✓ 已保存' : '保存'}</button>
        </div>
        <div className="page-section-body">
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>项目</div>
          <div className="sidebar-item active"><span className="sidebar-item-icon"><DesignerIcon name="settings" /></span><div className="sidebar-item-info"><span className="sidebar-item-name">项目配置</span></div></div>
          <div className="sidebar-item" onClick={() => setShowVersions(!showVersions)}>
            <span className="sidebar-item-icon"><DesignerIcon name="projects" /></span>
            <div className="sidebar-item-info">
              <span className="sidebar-item-name">版本管理</span>
              <span className="sidebar-item-meta">{versions.length} 个版本</span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginTop: 12, marginBottom: 4 }}>行为</div>
          <div className="sidebar-item"><span className="sidebar-item-icon"><DesignerIcon name="behavior" /></span><div className="sidebar-item-info"><span className="sidebar-item-name">行为设置</span></div></div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginTop: 12, marginBottom: 4 }}>发布</div>
          <div className="sidebar-item"><span className="sidebar-item-icon"><DesignerIcon name="upload" /></span><div className="sidebar-item-info"><span className="sidebar-item-name">发布设置</span></div></div>
        </div>
      </div>

      {/* 中间：配置表单 */}
      <div className="page-main">
        <div className="page-section-header">
          <span>项目配置</span>
          <span>{project.config.name}</span>
        </div>
        <div className="page-section-body">
          <div className="settings-form">
            <label><span>项目名称</span><input value={project.config.name} onChange={(e) => updateField('name', e.target.value)} /></label>
            <label><span>描述</span><input value={project.config.description} onChange={(e) => updateField('description', e.target.value)} /></label>
            <label><span>作者</span><input value={project.config.author} onChange={(e) => updateField('author', e.target.value)} /></label>
            <label><span>版本</span><input value={project.config.version} onChange={(e) => updateField('version', e.target.value)} /></label>
          </div>
        </div>
      </div>

      {/* 右侧：版本管理 */}
      <div className="page-inspector">
        <div className="page-section-header">
          <span>版本管理</span>
          <span>{versions.length} 个版本</span>
        </div>
        <div className="page-section-body">
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="版本备注…" style={{ flex: 1, padding: '4px 6px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4 }} />
            <button onClick={saveVersion} style={{ padding: '4px 8px', fontSize: 11, border: '1px solid var(--accent)', borderRadius: 4, background: 'var(--accent)', color: '#fff' }}>保存版本</button>
          </div>
          {versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 12 }}>暂无历史版本</div>
          ) : versions.map((v) => (
            <div key={v.id} className="sidebar-item">
              <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 11 }}>v{v.version}</span>
              <div className="sidebar-item-info">
                <span className="sidebar-item-name">{v.label}</span>
                <span className="sidebar-item-meta">{new Date(v.timestamp).toLocaleString()}</span>
              </div>
              <button onClick={() => restoreVer(v.id)} style={{ padding: '2px 6px', fontSize: 10, border: '1px solid var(--line)', borderRadius: 4, background: 'var(--panel)' }}>恢复</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
