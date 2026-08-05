import React from 'react';
import { useMemo, useState } from 'react';
import { InputNumber, Select, Slider, Switch } from 'antd';
import { useSystemSettingsStore } from '../../project/systemSettingsStore';
import { getFontFamilyOptions, applyTheme } from '../../services/config/themeUtils';
import type { ThemeMode, ShortcutScheme, NotificationSound, NotificationTypePrefs } from '../../services/config/systemSettings';

type NotificationTypeKey = 'success' | 'warning' | 'error' | 'info';

const themeOptions: Array<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'light', label: '浅色', icon: '☀️' },
  { value: 'dark', label: '深色', icon: '🌙' },
  { value: 'system', label: '跟随系统', icon: '💻' },
];

const shortcutOptions: Array<{ value: ShortcutScheme; label: string }> = [
  { value: 'vscode', label: 'VS Code 风格' },
  { value: 'vim', label: 'Vim 风格' },
];

const soundOptions: Array<{ value: NotificationSound; label: string }> = [
  { value: 'default', label: '默认提示音' },
  { value: 'subtle', label: '轻柔' },
  { value: 'chime', label: '清脆' },
  { value: 'none', label: '无' },
];

const notificationTypes: Array<{ key: NotificationTypeKey; label: string; color: string }> = [
  { key: 'success', label: '成功', color: 'var(--success)' },
  { key: 'warning', label: '警告', color: 'var(--warning)' },
  { key: 'error', label: '错误', color: 'var(--danger)' },
  { key: 'info', label: '信息', color: 'var(--accent)' },
];

const fontOptions = getFontFamilyOptions();

function ThemePreview({ mode, active, onClick }: { mode: typeof themeOptions[number]; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`theme-preview-card ${active ? 'active' : ''}`}
      onClick={onClick}
      data-theme-preview={mode.value}
    >
      <span className="theme-preview-icon">{mode.icon}</span>
      <span className="theme-preview-label">{mode.label}</span>
      {active && <span className="theme-preview-check">✓</span>}
    </button>
  );
}

export default function AppearanceSection() {
  const { settings, updateSettings } = useSystemSettingsStore();
  const { appearance } = settings;
  const [shortcutSearch, setShortcutSearch] = useState('');

  const updateAppearance = <K extends keyof typeof appearance>(key: K, value: typeof appearance[K]) => {
    updateSettings((current) => ({
      ...current,
      appearance: { ...current.appearance, [key]: value },
    }));
  };

  const updateNotification = (type: NotificationTypeKey, patch: Partial<NotificationTypePrefs>) => {
    updateSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        notifications: {
          ...current.appearance.notifications,
          [type]: { ...current.appearance.notifications[type], ...patch },
        },
      },
    }));
  };

  const handleThemeChange = (theme: ThemeMode) => {
    updateAppearance('theme', theme);
    applyTheme(theme);
  };

  const previewShortcuts = useMemo(() => {
    const scheme = appearance.shortcutScheme;
    const base: Record<string, string> = scheme === 'vim'
      ? { 'save': ':w', 'copy': 'y', 'paste': 'p', 'undo': 'u', 'redo': 'Ctrl+r', 'find': '/', 'close': ':q' }
      : { 'save': 'Ctrl+S', 'copy': 'Ctrl+C', 'paste': 'Ctrl+V', 'undo': 'Ctrl+Z', 'redo': 'Ctrl+Shift+Z', 'find': 'Ctrl+F', 'close': 'Ctrl+W' };
    const merged = { ...base, ...appearance.shortcutOverrides };
    return Object.entries(merged).filter(([key]) => !shortcutSearch || key.includes(shortcutSearch.toLowerCase()));
  }, [appearance.shortcutScheme, appearance.shortcutOverrides, shortcutSearch]);

  return (
    <div className="settings-card-stack system-settings-content-grid">
      {/* Theme */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>主题</h3>
            <p>选择应用的外观主题。</p>
          </div>
        </div>
        <div className="theme-preview-row">
          {themeOptions.map((option) => (
            <ThemePreview
              key={option.value}
              mode={option}
              active={appearance.theme === option.value}
              onClick={() => handleThemeChange(option.value)}
            />
          ))}
        </div>
      </section>

      {/* Editor Font */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>编辑器字体</h3>
            <p>设置代码编辑器使用的等宽字体。</p>
          </div>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>字体族</span>
            <Select
              value={appearance.editorFontFamily}
              options={fontOptions}
              onChange={(value: string) => updateAppearance('editorFontFamily', value)}
            />
          </label>
          {appearance.editorFontFamily === 'custom' && (
            <label>
              <span>自定义 font-family</span>
              <input
                value={appearance.editorFontFamilyCustom}
                onChange={(e) => updateAppearance('editorFontFamilyCustom', e.target.value)}
                placeholder="'MyFont', monospace"
              />
            </label>
          )}
        </div>
      </section>

      {/* Sidebar */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>侧边栏</h3>
            <p>调整侧边栏宽度和收起状态。</p>
          </div>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>默认宽度 ({appearance.sidebarWidth}px)</span>
            <Slider
              min={180}
              max={400}
              value={appearance.sidebarWidth}
              onChange={(value: number) => updateAppearance('sidebarWidth', value)}
            />
          </label>
        </div>
        <div className="settings-toggle-list">
          <label className="settings-option-item">
            <Switch
              checked={appearance.sidebarCollapsed}
              onChange={(checked) => updateAppearance('sidebarCollapsed', checked)}
            />
            <span>默认收起侧边栏</span>
          </label>
        </div>
      </section>

      {/* Canvas Zoom */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>画布缩放</h3>
            <p>设置表单设计器画布的默认缩放比例。运行时可通过 Ctrl/Cmd + 滚轮调整。</p>
          </div>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>默认缩放 ({appearance.canvasZoom}%)</span>
            <InputNumber
              min={25}
              max={400}
              value={appearance.canvasZoom}
              onChange={(value) => updateAppearance('canvasZoom', value ?? 100)}
              addonAfter="%"
            />
          </label>
        </div>
      </section>

      {/* Shortcuts */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>快捷键</h3>
            <p>选择快捷键方案，可逐条覆盖。</p>
          </div>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>快捷键方案</span>
            <Select
              value={appearance.shortcutScheme}
              options={shortcutOptions}
              onChange={(value: ShortcutScheme) => updateAppearance('shortcutScheme', value)}
            />
          </label>
        </div>
        <div className="shortcut-list-section">
          <input
            className="shortcut-search"
            value={shortcutSearch}
            onChange={(e) => setShortcutSearch(e.target.value)}
            placeholder="搜索快捷键…"
          />
          <div className="shortcut-list">
            {previewShortcuts.map(([action, key]) => (
              <div className="shortcut-row" key={action}>
                <span className="shortcut-action">{action}</span>
                <kbd className="shortcut-key">{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>通知偏好</h3>
            <p>按类型控制通知的弹窗、声音和自动消失时间。</p>
          </div>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>提示音</span>
            <Select
              value={appearance.notificationSound}
              options={soundOptions}
              onChange={(value: NotificationSound) => updateAppearance('notificationSound', value)}
            />
          </label>
        </div>
        <div className="notification-type-grid">
          {notificationTypes.map(({ key, label, color }) => (
            <div className="notification-type-card" key={key}>
              <div className="notification-type-header">
                <span className="notification-type-dot" style={{ background: color }} />
                <strong>{label}</strong>
              </div>
              <div className="notification-type-controls">
                <label className="settings-option-item">
                  <Switch
                    checked={appearance.notifications[key].toast}
                    onChange={(checked) => updateNotification(key, { toast: checked })}
                  />
                  <span>弹窗</span>
                </label>
                <label className="settings-option-item">
                  <Switch
                    checked={appearance.notifications[key].sound}
                    onChange={(checked) => updateNotification(key, { sound: checked })}
                  />
                  <span>发声</span>
                </label>
                <label>
                  <span className="notification-duration-label">自动消失</span>
                  <Select
                    value={appearance.notifications[key].durationMs}
                    options={[
                      { value: 2000, label: '2 秒' },
                      { value: 3000, label: '3 秒' },
                      { value: 5000, label: '5 秒' },
                      { value: 8000, label: '8 秒' },
                      { value: 0, label: '不自动消失' },
                    ]}
                    onChange={(value: number) => updateNotification(key, { durationMs: value })}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
