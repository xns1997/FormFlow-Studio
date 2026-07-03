import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSystemSettingsStore } from '../project/systemSettingsStore';
import type { SystemSettingsSection } from '../services/routes';

const sectionMeta: Record<SystemSettingsSection, { title: string; description: string }> = {
  general: { title: '常规', description: '应用级语言、时区和启动行为。' },
  storage: { title: '存储', description: '后端 API 地址与离线保存偏好。' },
  editor: { title: '编辑器', description: '代码编辑器和提示面板相关设置。' },
  experiments: { title: '实验功能', description: '用于灰度控制新路由和预览文档等特性。' },
};

export default function SystemSettingsPage() {
  const { section: rawSection = 'general' } = useParams<{ section?: SystemSettingsSection }>();
  const section = (rawSection in sectionMeta ? rawSection : 'general') as SystemSettingsSection;
  const { settings, initSettings, updateSettings } = useSystemSettingsStore();

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  return (
    <div className="page-layout">
      <div className="page-main" style={{ borderRight: 'none' }}>
        <div className="page-section-header">
          <span>系统配置 · {sectionMeta[section].title}</span>
          <span>{settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : ''}</span>
        </div>
        <div className="page-section-body">
          <div className="settings-page-body">
          <p className="system-settings-lead">{sectionMeta[section].description}</p>
          <section className="settings-card">
            <div className="settings-card-header">
              <div className="settings-card-title">
                <h3>{sectionMeta[section].title}</h3>
                <p>{sectionMeta[section].description}</p>
              </div>
            </div>
          <div className="settings-form settings-grid">
            {section === 'general' && (
              <>
                <label><span>语言</span><input value={settings.general.language} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, language: e.target.value } }))} /></label>
                <label><span>时区</span><input value={settings.general.timezone} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, timezone: e.target.value } }))} /></label>
                <label className="settings-option-item" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={settings.general.autoOpenLastProject} onChange={(e) => updateSettings((current) => ({ ...current, general: { ...current.general, autoOpenLastProject: e.target.checked } }))} /><span>启动时自动恢复最近项目</span></label>
              </>
            )}
            {section === 'storage' && (
              <>
                <label><span>API Base</span><input value={settings.storage.apiBase} onChange={(e) => updateSettings((current) => ({ ...current, storage: { ...current.storage, apiBase: e.target.value } }))} /></label>
                <label className="settings-option-item"><input type="checkbox" checked={settings.storage.preferOfflineSave} onChange={(e) => updateSettings((current) => ({ ...current, storage: { ...current.storage, preferOfflineSave: e.target.checked } }))} /><span>优先离线兼容保存</span></label>
              </>
            )}
            {section === 'editor' && (
              <>
                <label><span>默认字号</span><input type="number" value={settings.editor.fontSize} onChange={(e) => updateSettings((current) => ({ ...current, editor: { ...current.editor, fontSize: Number(e.target.value) || 13 } }))} /></label>
                <label className="settings-option-item"><input type="checkbox" checked={settings.editor.lineNumbers} onChange={(e) => updateSettings((current) => ({ ...current, editor: { ...current.editor, lineNumbers: e.target.checked } }))} /><span>显示行号</span></label>
                <label className="settings-option-item"><input type="checkbox" checked={settings.editor.suggestionDocs} onChange={(e) => updateSettings((current) => ({ ...current, editor: { ...current.editor, suggestionDocs: e.target.checked } }))} /><span>显示补全文档</span></label>
              </>
            )}
            {section === 'experiments' && (
              <>
                <label className="settings-option-item"><input type="checkbox" checked={settings.experiments.enableNewRouter} onChange={(e) => updateSettings((current) => ({ ...current, experiments: { ...current.experiments, enableNewRouter: e.target.checked } }))} /><span>启用新路由分层</span></label>
                <label className="settings-option-item"><input type="checkbox" checked={settings.experiments.enablePreviewDocs} onChange={(e) => updateSettings((current) => ({ ...current, experiments: { ...current.experiments, enablePreviewDocs: e.target.checked } }))} /><span>启用文档预览入口</span></label>
              </>
            )}
          </div>
          </section>
          </div>
        </div>
      </div>
    </div>
  );
}
