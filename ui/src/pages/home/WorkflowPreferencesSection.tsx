import React from 'react';
import { InputNumber, Select, Switch } from 'antd';
import { AntdCompatSelect } from '../../components/AntdFormControls';
import { useSystemSettingsStore } from '../../project/systemSettingsStore';
import type { AutoSaveInterval, LabelPosition, SpacingPreset } from '../../services/config/systemSettings';

const autoSaveOptions: Array<{ value: AutoSaveInterval; label: string }> = [
  { value: 'off', label: '关闭' },
  { value: '30s', label: '30 秒' },
  { value: '1m', label: '1 分钟' },
  { value: '2m', label: '2 分钟' },
  { value: '5m', label: '5 分钟' },
];

const labelPositionOptions: Array<{ value: LabelPosition; label: string }> = [
  { value: 'top', label: '上方' },
  { value: 'left', label: '左侧' },
  { value: 'right', label: '右侧' },
];

const spacingOptions: Array<{ value: SpacingPreset; label: string }> = [
  { value: 'compact', label: '紧凑' },
  { value: 'standard', label: '标准' },
  { value: 'spacious', label: '宽松' },
];

const encodingOptions = ['UTF-8', 'GBK', 'GB2312', 'ISO-8859-1', 'Big5'].map((v) => ({ value: v, label: v }));
const delimiterOptions = [
  { value: ',', label: ', 逗号' },
  { value: ';', label: '; 分号' },
  { value: '\\t', label: 'Tab 制表符' },
  { value: '|', label: '| 竖线' },
];

export default function WorkflowPreferencesSection() {
  const { settings, updateSettings } = useSystemSettingsStore();
  const { workflowPreferences: wf } = settings;

  const updateBehavior = <K extends keyof typeof wf.defaultBehavior>(key: K, value: typeof wf.defaultBehavior[K]) => {
    updateSettings((current) => ({
      ...current,
      workflowPreferences: {
        ...current.workflowPreferences,
        defaultBehavior: { ...current.workflowPreferences.defaultBehavior, [key]: value },
      },
    }));
  };

  const updateDataImport = <K extends keyof typeof wf.dataImport>(key: K, value: typeof wf.dataImport[K]) => {
    updateSettings((current) => ({
      ...current,
      workflowPreferences: {
        ...current.workflowPreferences,
        dataImport: { ...current.workflowPreferences.dataImport, [key]: value },
      },
    }));
  };

  const updateFormDesigner = <K extends keyof typeof wf.formDesigner>(key: K, value: typeof wf.formDesigner[K]) => {
    updateSettings((current) => ({
      ...current,
      workflowPreferences: {
        ...current.workflowPreferences,
        formDesigner: { ...current.workflowPreferences.formDesigner, [key]: value },
      },
    }));
  };

  return (
    <div className="settings-card-stack system-settings-content-grid">
      {/* Default Behavior */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>默认行为策略</h3>
            <p>新建项目时自动继承的行为配置。</p>
          </div>
        </div>
        <div className="settings-toggle-list" style={{ marginBottom: 14 }}>
          <label className="settings-option-item">
            <Switch checked={wf.defaultBehavior.enableJsScripts} onChange={(checked) => updateBehavior('enableJsScripts', checked)} />
            <span>启用 JS 脚本行为</span>
          </label>
          <label className="settings-option-item">
            <Switch checked={wf.defaultBehavior.enableNodeBehavior} onChange={(checked) => updateBehavior('enableNodeBehavior', checked)} />
            <span>启用节点行为</span>
          </label>
          <label className="settings-option-item">
            <Switch checked={wf.defaultBehavior.enableDebugDrawer} onChange={(checked) => updateBehavior('enableDebugDrawer', checked)} />
            <span>启用调试抽屉</span>
          </label>
          <label className="settings-option-item">
            <Switch checked={wf.defaultBehavior.autoOpenDebugDrawerOnWarnOrError} onChange={(checked) => updateBehavior('autoOpenDebugDrawerOnWarnOrError', checked)} />
            <span>出现告警/错误时自动展开调试抽屉</span>
          </label>
          <label className="settings-option-item">
            <Switch checked={wf.defaultBehavior.mirrorScriptLogsToConsole} onChange={(checked) => updateBehavior('mirrorScriptLogsToConsole', checked)} />
            <span>脚本日志同步到浏览器 Console</span>
          </label>
          <label className="settings-option-item">
            <Switch checked={wf.defaultBehavior.enableServerDebugApi} onChange={(checked) => updateBehavior('enableServerDebugApi', checked)} />
            <span>启用服务端调试 API</span>
          </label>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>脚本超时（毫秒）</span>
            <InputNumber
              min={1000}
              max={60000}
              value={wf.defaultBehavior.scriptTimeout}
              onChange={(value) => updateBehavior('scriptTimeout', value ?? 5000)}
            />
          </label>
          <label>
            <span>错误策略</span>
            <AntdCompatSelect
              value={wf.defaultBehavior.errorStrategy}
              onChange={(e) => updateBehavior('errorStrategy', e.target.value as 'show-error' | 'silent')}
            >
              <option value="show-error">显示错误</option>
              <option value="silent">静默处理</option>
            </AntdCompatSelect>
          </label>
          <label>
            <span>循环保护上限</span>
            <InputNumber
              min={10}
              max={1000}
              value={wf.defaultBehavior.loopProtection}
              onChange={(value) => updateBehavior('loopProtection', value ?? 100)}
            />
          </label>
        </div>
      </section>

      {/* Data Import */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>数据导入</h3>
            <p>导入数据时的默认编码、分隔符和表头设置。导入时可临时覆盖。</p>
          </div>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>默认编码</span>
            <Select
              value={wf.dataImport.encoding}
              options={encodingOptions}
              onChange={(value: string) => updateDataImport('encoding', value)}
            />
          </label>
          <label>
            <span>默认分隔符</span>
            <Select
              value={wf.dataImport.delimiter}
              options={delimiterOptions}
              onChange={(value: string) => updateDataImport('delimiter', value)}
            />
          </label>
        </div>
        <div className="settings-toggle-list">
          <label className="settings-option-item">
            <Switch checked={wf.dataImport.hasHeader} onChange={(checked) => updateDataImport('hasHeader', checked)} />
            <span>首行为表头</span>
          </label>
        </div>
      </section>

      {/* Form Designer */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>表单设计器</h3>
            <p>新建表单时的默认布局配置。</p>
          </div>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>标签位置</span>
            <Select
              value={wf.formDesigner.labelPosition}
              options={labelPositionOptions}
              onChange={(value: LabelPosition) => updateFormDesigner('labelPosition', value)}
            />
          </label>
          <label>
            <span>默认列数</span>
            <Select
              value={wf.formDesigner.columns}
              options={[1, 2, 3].map((n) => ({ value: n, label: `${n} 列` }))}
              onChange={(value: number) => updateFormDesigner('columns', value)}
            />
          </label>
          <label>
            <span>控件间距</span>
            <Select
              value={wf.formDesigner.spacing}
              options={spacingOptions}
              onChange={(value: SpacingPreset) => updateFormDesigner('spacing', value)}
            />
          </label>
        </div>
      </section>

      {/* Auto Save */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>自动保存</h3>
            <p>控制项目草稿的自动保存频率。</p>
          </div>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>保存间隔</span>
            <Select
              value={wf.autoSaveInterval}
              options={autoSaveOptions}
              onChange={(value: AutoSaveInterval) => updateSettings((current) => ({
                ...current,
                workflowPreferences: { ...current.workflowPreferences, autoSaveInterval: value },
              }))}
            />
          </label>
        </div>
      </section>

      {/* Template */}
      <section className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <h3>项目模板</h3>
            <p>新建项目时的默认模板偏好。</p>
          </div>
        </div>
        <div className="settings-form settings-grid">
          <label>
            <span>默认模板 ID</span>
            <input
              value={wf.defaultTemplate}
              onChange={(e) => updateSettings((current) => ({
                ...current,
                workflowPreferences: { ...current.workflowPreferences, defaultTemplate: e.target.value },
              }))}
              placeholder="留空则每次手动选择"
            />
          </label>
        </div>
      </section>
    </div>
  );
}
