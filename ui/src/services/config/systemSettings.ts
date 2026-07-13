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
