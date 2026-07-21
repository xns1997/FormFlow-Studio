import React, { useEffect, useMemo } from 'react';
import { AntdCompatSelect } from '../../components/AntdFormControls';
import { Link, useParams } from 'react-router-dom';
import { useSystemSettingsStore } from '../../project/systemSettingsStore';
import { buildSystemSettingsPath, type SystemSettingsSection } from '../../services/io/routes';
import LlmSettingsSection from './LlmSettingsSection';
import { DesignerIcon } from '../../designer/icons';

const sectionMeta: Record<SystemSettingsSection, { title: string; description: string; badge: string }> = {
  general: { title: '常规', description: '应用级语言、时区、日期格式与顶部时钟显示。', badge: 'Workspace' },
  storage: { title: '存储', description: '后端地址、草稿自动保存与请求超时策略。', badge: 'Data' },
  editor: { title: '编辑器', description: '代码编辑器阅读性与默认编辑行为。', badge: 'Editor' },
  ai: { title: '大模型', description: '管理模型 Provider、模型 Profile、fallback 与 Agent 运行服务。', badge: 'AI Runtime' },
  experiments: { title: '实验功能', description: '灰度开关与调试、文档试玩等增强能力。', badge: 'Labs' },
};

const settingsNavigation: Array<{ section: SystemSettingsSection; label: string; icon: string }> = [
  { section: 'general', label: '常规', icon: 'settings' },
  { section: 'storage', label: '存储', icon: 'upload' },
  { section: 'editor', label: '编辑器', icon: 'design' },
  { section: 'ai', label: '大模型', icon: 'behavior' },
  { section: 'experiments', label: '实验功能', icon: 'test' },
];

export default function SystemSettingsPage() {
  const { section: rawSection = 'general' } = useParams<{ section?: SystemSettingsSection }>();
  const section = (rawSection in sectionMeta ? rawSection : 'general') as SystemSettingsSection;
  const { settings, initSettings, updateSettings } = useSystemSettingsStore();

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  useEffect(() => {
    try { localStorage.setItem('formflow.settings.lastSection', section); } catch { /* ignore unavailable storage */ }
  }, [section]);

  const summaryStats = useMemo(() => {
    return [
      { label: '时区', value: settings.general.timezone },
      { label: 'API', value: settings.storage.apiBase.replace(/^https?:\/\//, '') || '--' },
      { label: '字号', value: `${settings.editor.fontSize}px` },
      { label: '实验项', value: [settings.experiments.enablePreviewDocs, settings.experiments.enablePlaygroundDocs, settings.experiments.enableDebugTools].filter(Boolean).length.toString() },
    ];
  }, [settings]);

  return (
    <div className="page-layout system-settings-layout">
      <aside className="system-settings-sidebar" aria-label="系统设置分类">
        <div className="system-settings-sidebar-heading">
          <span>设置</span>
          <small>FormFlow 偏好设置</small>
        </div>
        <nav className="system-settings-sidebar-nav">
          {settingsNavigation.map((item) => (
            <Link
              key={item.section}
              to={buildSystemSettingsPath(item.section)}
              className={`system-settings-sidebar-link ${section === item.section ? 'active' : ''}`}
              aria-current={section === item.section ? 'page' : undefined}
            >
              <DesignerIcon name={item.icon} className="nav-icon" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <div className="page-main" style={{ borderRight: 'none' }}>
        <div className="page-section-body">
          <div className="settings-page-body system-settings-page">
            <section className="settings-card system-settings-hero">
              <div className="system-settings-hero-copy">
                <span className="system-settings-badge">{sectionMeta[section].badge}</span>
                <h2>{sectionMeta[section].title}</h2>
                <p>{sectionMeta[section].description}</p>
              </div>
              <div className="system-settings-stat-row">
                {summaryStats.map((item) => (
                  <div key={item.label} className="system-settings-stat">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            {section === 'general' && (
              <div className="settings-card-stack system-settings-content-grid">
                <section className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-title">
                      <h3>本地化</h3>
                      <p>控制语言、时区和日期展示格式。</p>
                    </div>
                  </div>
                  <div className="settings-form settings-grid">
                    <label><span>语言</span><input value={settings.general.language} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, language: e.target.value } }))} /></label>
                    <label><span>时区</span><input value={settings.general.timezone} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, timezone: e.target.value } }))} /></label>
                    <label><span>日期格式</span><AntdCompatSelect value={settings.general.dateFormat} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, dateFormat: e.target.value as typeof current.general.dateFormat } }))}><option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="YYYY/MM/DD">YYYY/MM/DD</option><option value="locale">跟随浏览器区域</option></AntdCompatSelect></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.general.autoOpenLastProject} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, autoOpenLastProject: e.target.checked } }))} /><span>启动时自动恢复最近项目</span></label>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-title">
                      <h3>顶部状态栏</h3>
                      <p>控制右上角时钟与时间表现形式。</p>
                    </div>
                  </div>
                  <div className="settings-toggle-list">
                    <label className="settings-option-item"><input type="checkbox" checked={settings.general.showClock} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, showClock: e.target.checked } }))} /><span>在右上角显示时钟</span></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.general.use24Hour} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, use24Hour: e.target.checked } }))} /><span>使用 24 小时制</span></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.general.showSeconds} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, showSeconds: e.target.checked } }))} /><span>显示秒数</span></label>
                  </div>
                </section>
              </div>
            )}

            {section === 'storage' && (
              <div className="settings-card-stack system-settings-content-grid">
                <section className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-title">
                      <h3>连接与保存</h3>
                      <p>设置默认 API 地址和本地存储偏好。</p>
                    </div>
                  </div>
                  <div className="settings-form settings-grid">
                    <label><span>API Base</span><input value={settings.storage.apiBase} onChange={(e) => updateSettings((current) => ({ ...current, storage: { ...current.storage, apiBase: e.target.value } }))} /></label>
                    <label><span>请求超时（毫秒）</span><input type="number" value={settings.storage.requestTimeoutMs} onChange={(e) => updateSettings((current) => ({ ...current, storage: { ...current.storage, requestTimeoutMs: Math.max(1000, Number(e.target.value) || 15000) } }))} /></label>
                  </div>
                  <div className="settings-toggle-list">
                    <label className="settings-option-item"><input type="checkbox" checked={settings.storage.preferOfflineSave} onChange={(e) => updateSettings((current) => ({ ...current, storage: { ...current.storage, preferOfflineSave: e.target.checked } }))} /><span>优先离线兼容保存</span></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.storage.autoSaveDrafts} onChange={(e) => updateSettings((current) => ({ ...current, storage: { ...current.storage, autoSaveDrafts: e.target.checked } }))} /><span>自动保存草稿</span></label>
                  </div>
                </section>
              </div>
            )}

            {section === 'editor' && (
              <div className="settings-card-stack system-settings-content-grid">
                <section className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-title">
                      <h3>编辑体验</h3>
                      <p>控制代码面板、补全和可读性选项。</p>
                    </div>
                  </div>
                  <div className="settings-form settings-grid">
                    <label><span>默认字号</span><input type="number" value={settings.editor.fontSize} onChange={(e) => updateSettings((current) => ({ ...current, editor: { ...current.editor, fontSize: Math.max(11, Number(e.target.value) || 13) } }))} /></label>
                  </div>
                  <div className="settings-toggle-list">
                    <label className="settings-option-item"><input type="checkbox" checked={settings.editor.lineNumbers} onChange={(e) => updateSettings((current) => ({ ...current, editor: { ...current.editor, lineNumbers: e.target.checked } }))} /><span>显示行号</span></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.editor.suggestionDocs} onChange={(e) => updateSettings((current) => ({ ...current, editor: { ...current.editor, suggestionDocs: e.target.checked } }))} /><span>显示补全文档</span></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.editor.wordWrap} onChange={(e) => updateSettings((current) => ({ ...current, editor: { ...current.editor, wordWrap: e.target.checked } }))} /><span>自动换行</span></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.editor.formatOnSave} onChange={(e) => updateSettings((current) => ({ ...current, editor: { ...current.editor, formatOnSave: e.target.checked } }))} /><span>保存时自动格式化</span></label>
                  </div>
                </section>
              </div>
            )}

            {section === 'experiments' && (
              <div className="settings-card-stack system-settings-content-grid">
                <section className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-title">
                      <h3>灰度与增强</h3>
                      <p>为新路由、文档试玩和调试工具提供项目外的全局控制。</p>
                    </div>
                  </div>
                  <div className="settings-toggle-list">
                    <label className="settings-option-item"><input type="checkbox" checked={settings.experiments.enableNewRouter} onChange={(e) => updateSettings((current) => ({ ...current, experiments: { ...current.experiments, enableNewRouter: e.target.checked } }))} /><span>启用新路由分层</span></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.experiments.enablePreviewDocs} onChange={(e) => updateSettings((current) => ({ ...current, experiments: { ...current.experiments, enablePreviewDocs: e.target.checked } }))} /><span>启用文档预览入口</span></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.experiments.enablePlaygroundDocs} onChange={(e) => updateSettings((current) => ({ ...current, experiments: { ...current.experiments, enablePlaygroundDocs: e.target.checked } }))} /><span>启用组件文档 Playground</span></label>
                    <label className="settings-option-item"><input type="checkbox" checked={settings.experiments.enableDebugTools} onChange={(e) => updateSettings((current) => ({ ...current, experiments: { ...current.experiments, enableDebugTools: e.target.checked } }))} /><span>启用调试增强工具</span></label>
                  </div>
                </section>
              </div>
            )}
            {section === 'ai' && <LlmSettingsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
