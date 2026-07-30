export type ThemeMode = 'light' | 'dark' | 'system';
export type ShortcutScheme = 'vscode' | 'vim';
export type SpacingPreset = 'compact' | 'standard' | 'spacious';
export type LabelPosition = 'top' | 'left' | 'right';
export type AutoSaveInterval = 'off' | '30s' | '1m' | '2m' | '5m';
export type NotificationSound = 'default' | 'subtle' | 'chime' | 'none';

export interface NotificationTypePrefs {
  toast: boolean;
  sound: boolean;
  durationMs: number;
}

export interface SystemSettings {
  general: {
    language: string;
    timezone: string;
    autoOpenLastProject: boolean;
    dateFormat: 'YYYY-MM-DD' | 'YYYY/MM/DD' | 'locale';
    showClock: boolean;
    use24Hour: boolean;
    showSeconds: boolean;
  };
  storage: {
    apiBase: string;
    preferOfflineSave: boolean;
    autoSaveDrafts: boolean;
    requestTimeoutMs: number;
  };
  editor: {
    fontSize: number;
    lineNumbers: boolean;
    suggestionDocs: boolean;
    wordWrap: boolean;
    formatOnSave: boolean;
  };
  appearance: {
    theme: ThemeMode;
    editorFontFamily: string;
    editorFontFamilyCustom: string;
    sidebarWidth: number;
    sidebarCollapsed: boolean;
    canvasZoom: number;
    shortcutScheme: ShortcutScheme;
    shortcutOverrides: Record<string, string>;
    notificationSound: NotificationSound;
    notifications: {
      success: NotificationTypePrefs;
      warning: NotificationTypePrefs;
      error: NotificationTypePrefs;
      info: NotificationTypePrefs;
    };
  };
  workflowPreferences: {
    defaultBehavior: {
      enableJsScripts: boolean;
      enableNodeBehavior: boolean;
      enableDebugDrawer: boolean;
      autoOpenDebugDrawerOnWarnOrError: boolean;
      mirrorScriptLogsToConsole: boolean;
      enableServerDebugApi: boolean;
      scriptTimeout: number;
      errorStrategy: 'show-error' | 'silent';
      loopProtection: number;
    };
    dataImport: {
      encoding: string;
      delimiter: string;
      hasHeader: boolean;
    };
    formDesigner: {
      labelPosition: LabelPosition;
      columns: number;
      spacing: SpacingPreset;
    };
    autoSaveInterval: AutoSaveInterval;
    defaultTemplate: string;
    lastUsedTemplate: string;
  };
  experiments: {
    enableNewRouter: boolean;
    enablePreviewDocs: boolean;
    enablePlaygroundDocs: boolean;
    enableDebugTools: boolean;
  };
  updatedAt: string;
}

const STORAGE_KEY = 'formflow_system_settings';

export function createDefaultSystemSettings(): SystemSettings {
  return {
    general: {
      language: 'zh-CN',
      timezone: 'Asia/Shanghai',
      autoOpenLastProject: true,
      dateFormat: 'YYYY-MM-DD',
      showClock: true,
      use24Hour: true,
      showSeconds: true,
    },
    storage: {
      apiBase: 'http://localhost:3001/api',
      preferOfflineSave: true,
      autoSaveDrafts: true,
      requestTimeoutMs: 15000,
    },
    editor: {
      fontSize: 13,
      lineNumbers: true,
      suggestionDocs: true,
      wordWrap: true,
      formatOnSave: false,
    },
    appearance: {
      theme: 'system',
      editorFontFamily: 'default',
      editorFontFamilyCustom: '',
      sidebarWidth: 240,
      sidebarCollapsed: false,
      canvasZoom: 100,
      shortcutScheme: 'vscode',
      shortcutOverrides: {},
      notificationSound: 'default',
      notifications: {
        success: { toast: true, sound: false, durationMs: 3000 },
        warning: { toast: true, sound: true, durationMs: 5000 },
        error: { toast: true, sound: true, durationMs: 8000 },
        info: { toast: true, sound: false, durationMs: 4000 },
      },
    },
    workflowPreferences: {
      defaultBehavior: {
        enableJsScripts: true,
        enableNodeBehavior: true,
        enableDebugDrawer: true,
        autoOpenDebugDrawerOnWarnOrError: true,
        mirrorScriptLogsToConsole: false,
        enableServerDebugApi: false,
        scriptTimeout: 5000,
        errorStrategy: 'show-error',
        loopProtection: 100,
      },
      dataImport: {
        encoding: 'UTF-8',
        delimiter: ',',
        hasHeader: true,
      },
      formDesigner: {
        labelPosition: 'top',
        columns: 1,
        spacing: 'standard',
      },
      autoSaveInterval: '1m',
      defaultTemplate: '',
      lastUsedTemplate: '',
    },
    experiments: {
      enableNewRouter: true,
      enablePreviewDocs: true,
      enablePlaygroundDocs: true,
      enableDebugTools: true,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeSystemSettings(value: Partial<SystemSettings> | undefined): SystemSettings {
  const defaults = createDefaultSystemSettings();
  return {
    ...defaults,
    ...value,
    general: { ...defaults.general, ...(value?.general || {}) },
    storage: { ...defaults.storage, ...(value?.storage || {}) },
    editor: { ...defaults.editor, ...(value?.editor || {}) },
    appearance: {
      ...defaults.appearance,
      ...(value?.appearance || {}),
      notifications: {
        success: { ...defaults.appearance.notifications.success, ...(value?.appearance?.notifications?.success || {}) },
        warning: { ...defaults.appearance.notifications.warning, ...(value?.appearance?.notifications?.warning || {}) },
        error: { ...defaults.appearance.notifications.error, ...(value?.appearance?.notifications?.error || {}) },
        info: { ...defaults.appearance.notifications.info, ...(value?.appearance?.notifications?.info || {}) },
      },
    },
    workflowPreferences: {
      ...defaults.workflowPreferences,
      ...(value?.workflowPreferences || {}),
      defaultBehavior: { ...defaults.workflowPreferences.defaultBehavior, ...(value?.workflowPreferences?.defaultBehavior || {}) },
      dataImport: { ...defaults.workflowPreferences.dataImport, ...(value?.workflowPreferences?.dataImport || {}) },
      formDesigner: { ...defaults.workflowPreferences.formDesigner, ...(value?.workflowPreferences?.formDesigner || {}) },
    },
    experiments: { ...defaults.experiments, ...(value?.experiments || {}) },
    updatedAt: value?.updatedAt || defaults.updatedAt,
  };
}

function readStorage() {
  if (typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function loadSystemSettings(): SystemSettings {
  const raw = readStorage();
  if (!raw) return createDefaultSystemSettings();
  try {
    return normalizeSystemSettings(JSON.parse(raw) as Partial<SystemSettings>);
  } catch {
    return createDefaultSystemSettings();
  }
}

export function saveSystemSettings(settings: SystemSettings): SystemSettings {
  const next = normalizeSystemSettings({ ...settings, updatedAt: new Date().toISOString() });
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }
  return next;
}
