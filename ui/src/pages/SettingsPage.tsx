import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectStore } from '../project/store';
import { normalizeProjectStructure } from '../project/manager';
import { createVersion, getVersions, restoreVersion, type ProjectVersion } from '../services/projectVersionHistory';
import { buildDocsPath, type ProjectSettingsSection } from '../services/routes';

const sectionMeta: Record<ProjectSettingsSection, { title: string; description: string; docSlug?: string }> = {
  general: { title: '常规', description: '维护项目名称、描述、作者和版本信息。', docSlug: 'context-reference' },
  versions: { title: '版本', description: '查看、保存和恢复项目快照。', docSlug: 'flow-parameter-reference' },
  behavior: { title: '行为', description: '配置脚本执行、节点行为和异常处理策略。', docSlug: 'field-change' },
  publish: { title: '发布', description: '控制导出格式、写回行为和变更日志。', docSlug: 'submit' },
};
const settingsSections = Object.keys(sectionMeta) as ProjectSettingsSection[];

export default function SettingsPage() {
  const { id = '', section: rawSection } = useParams<{ id: string; section?: ProjectSettingsSection }>();
  const isEmbeddedMode = !rawSection;
  const [embeddedSection, setEmbeddedSection] = useState<ProjectSettingsSection>('general');
  const routeSection = rawSection && rawSection in sectionMeta ? rawSection : 'general';
  const section = (isEmbeddedMode ? embeddedSection : routeSection) as ProjectSettingsSection;
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const [saved, setSaved] = useState(false);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [versionLabel, setVersionLabel] = useState('');
  const projectSettings = project?.settings;

  useEffect(() => {
    if (project) setVersions(getVersions(project.config.id));
  }, [project]);

  useEffect(() => {
    if (!isEmbeddedMode) return;
    setEmbeddedSection('general');
  }, [isEmbeddedMode, project?.config.id]);

  const save = useCallback(async () => {
    if (!project) return;
    await setProject(project);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [project, setProject]);

  const updateConfigField = useCallback((field: 'name' | 'description' | 'author' | 'version', value: string) => {
    if (!project) return;
    setProject({
      ...project,
      config: { ...project.config, [field]: value, updatedAt: new Date().toISOString() },
    });
  }, [project, setProject]);

  const updateBehaviorSettings = useCallback((patch: Partial<NonNullable<typeof projectSettings>['behavior']>) => {
    if (!project || !projectSettings) return;
    setProject({
      ...project,
      settings: {
        ...projectSettings,
        behavior: { ...projectSettings.behavior, ...patch },
        updatedAt: new Date().toISOString(),
      },
    });
  }, [project, projectSettings, setProject]);

  const updatePublishSettings = useCallback((patch: Partial<NonNullable<typeof projectSettings>['publish']>) => {
    if (!project || !projectSettings) return;
    setProject({
      ...project,
      settings: {
        ...projectSettings,
        publish: { ...projectSettings.publish, ...patch },
        updatedAt: new Date().toISOString(),
      },
    });
  }, [project, projectSettings, setProject]);

  const saveVersion = useCallback(() => {
    if (!project) return;
    createVersion(project, versionLabel || `版本 ${versions.length + 1}`);
    setVersions(getVersions(project.config.id));
    setVersionLabel('');
  }, [project, versionLabel, versions]);

  const restoreVer = useCallback((versionId: string) => {
    if (!project) return;
    const restored = restoreVersion(project.config.id, versionId);
    if (restored) setProject(normalizeProjectStructure(restored));
  }, [project, setProject]);

  const docLink = useMemo(() => buildDocsPath(sectionMeta[section].docSlug, {
    fromProject: id,
    fromPage: 'settings',
    fromTab: section,
  }), [id, section]);

  if (!project || !projectSettings) return <div className="loading-splash"><p>未选择项目</p></div>;

  return (
    <div className="page-layout project-settings-layout">
      <div className="page-main project-settings-main">
        <div className="page-section-header">
          <span>项目设置 · {sectionMeta[section].title}</span>
          <div className="settings-toolbar-actions">
            <Link to={docLink} className="docs-link-button">查看相关文档</Link>
            <button onClick={save} style={{ padding: '2px 8px', fontSize: 11, border: '1px solid var(--line)', borderRadius: 4, background: saved ? '#dcfce7' : 'var(--panel)' }}>{saved ? '✓ 已保存' : '保存'}</button>
          </div>
        </div>
        <div className="page-section-body">
          <div className="settings-page-body project-settings-body">
          {isEmbeddedMode && (
            <div className="project-settings-section-tabs">
              {settingsSections.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={section === item ? 'sheet-tab active' : 'sheet-tab'}
                  onClick={() => setEmbeddedSection(item)}
                >
                  {sectionMeta[item].title}
                </button>
              ))}
            </div>
          )}
          <div className="settings-toolbar">
            <p className="system-settings-lead" style={{ margin: 0 }}>{sectionMeta[section].description}</p>
          </div>
          {section === 'general' && (
            <section className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-title">
                  <h3>基础信息</h3>
                  <p>维护当前项目的名称、描述和版本信息。</p>
                </div>
              </div>
              <div className="settings-form settings-grid">
                <label style={{ gridColumn: '1 / -1' }}><span>项目名称</span><input value={project.config.name} onChange={(e) => updateConfigField('name', e.target.value)} /></label>
                <label style={{ gridColumn: '1 / -1' }}><span>描述</span><input value={project.config.description} onChange={(e) => updateConfigField('description', e.target.value)} /></label>
                <label><span>作者</span><input value={project.config.author} onChange={(e) => updateConfigField('author', e.target.value)} /></label>
                <label><span>版本</span><input value={project.config.version} onChange={(e) => updateConfigField('version', e.target.value)} /></label>
              </div>
            </section>
          )}
          {section === 'behavior' && (
            <section className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-title">
                  <h3>执行策略</h3>
                  <p>控制脚本、节点行为和异常处理方式。</p>
                </div>
              </div>
              <div className="settings-toggle-list" style={{ marginBottom: 14 }}>
                <label className="settings-option-item"><input type="checkbox" checked={projectSettings.behavior.enableJsScripts} onChange={(e) => updateBehaviorSettings({ enableJsScripts: e.target.checked })} /><span>启用 JS 脚本行为</span></label>
                <label className="settings-option-item"><input type="checkbox" checked={projectSettings.behavior.enableNodeBehavior} onChange={(e) => updateBehaviorSettings({ enableNodeBehavior: e.target.checked })} /><span>启用节点行为</span></label>
              </div>
              <div className="settings-form settings-grid">
                <label><span>脚本超时（毫秒）</span><input type="number" value={projectSettings.behavior.scriptTimeout} onChange={(e) => updateBehaviorSettings({ scriptTimeout: Number(e.target.value) || 5000 })} /></label>
                <label><span>错误策略</span><select value={projectSettings.behavior.errorStrategy} onChange={(e) => updateBehaviorSettings({ errorStrategy: e.target.value as 'show-error' | 'silent' })}><option value="show-error">显示错误</option><option value="silent">静默处理</option></select></label>
                <label><span>循环保护上限</span><input type="number" value={projectSettings.behavior.loopProtection} onChange={(e) => updateBehaviorSettings({ loopProtection: Number(e.target.value) || 100 })} /></label>
              </div>
            </section>
          )}
          {section === 'publish' && (
            <section className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-title">
                  <h3>输出与写回</h3>
                  <p>管理导出格式、文件命名和回写策略。</p>
                </div>
              </div>
              <div className="settings-form settings-grid" style={{ marginBottom: 14 }}>
                <label><span>默认导出格式</span><select value={projectSettings.publish.format} onChange={(e) => updatePublishSettings({ format: e.target.value as typeof projectSettings.publish.format })}><option value="json">JSON</option><option value="xlsx">XLSX</option><option value="csv">CSV</option><option value="html">HTML</option></select></label>
                <label><span>输出文件名</span><input value={projectSettings.publish.outputFileName} onChange={(e) => updatePublishSettings({ outputFileName: e.target.value })} /></label>
              </div>
              <div className="settings-toggle-list">
                <label className="settings-option-item"><input type="checkbox" checked={projectSettings.publish.allowWriteBack} onChange={(e) => updatePublishSettings({ allowWriteBack: e.target.checked })} /><span>允许写回源数据</span></label>
                <label className="settings-option-item"><input type="checkbox" checked={projectSettings.publish.generateChangeLog} onChange={(e) => updatePublishSettings({ generateChangeLog: e.target.checked })} /><span>生成变更日志</span></label>
              </div>
            </section>
          )}
          {section === 'versions' && (
            <section className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-title">
                  <h3>版本快照</h3>
                  <p>保存当前项目状态，并按快照回退。</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input style={{ flex: 1 }} value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="版本备注…" />
                <button onClick={saveVersion}>保存版本</button>
              </div>
              <div className="settings-version-list">
                {versions.length === 0 ? (
                  <div className="docs-empty-inline">暂无历史版本。</div>
                ) : versions.map((version) => (
                  <div key={version.id} className="settings-version-item">
                    <div>
                      <strong>v{version.version} · {version.label}</strong>
                      <small>{new Date(version.timestamp).toLocaleString()}</small>
                    </div>
                    <button onClick={() => restoreVer(version.id)}>恢复</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          </div>
        </div>
      </div>
      <div className="page-inspector project-settings-inspector">
        <div className="page-section-header">
          <span>配置摘要</span>
          <span>{project.config.name}</span>
        </div>
        <div className="page-section-body">
            <div className="settings-summary-card">
              <div className="stat"><span className="stat-label">项目版本</span><span className="stat-value">{project.config.version}</span></div>
            <div className="stat"><span className="stat-label">行为脚本</span><span className="stat-value">{projectSettings.behavior.enableJsScripts ? '开启' : '关闭'}</span></div>
            <div className="stat"><span className="stat-label">默认导出</span><span className="stat-value">{projectSettings.publish.format.toUpperCase()}</span></div>
            <div className="stat"><span className="stat-label">版本快照</span><span className="stat-value">{versions.length}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
