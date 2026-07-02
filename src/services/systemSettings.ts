export interface SystemSettings {
  general: {
    language: string;
    timezone: string;
    autoOpenLastProject: boolean;
  };
  storage: {
    apiBase: string;
    preferOfflineSave: boolean;
  };
  editor: {
    fontSize: number;
    lineNumbers: boolean;
    suggestionDocs: boolean;
  };
  experiments: {
    enableNewRouter: boolean;
    enablePreviewDocs: boolean;
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
    },
    storage: {
      apiBase: 'http://localhost:3001/api',
      preferOfflineSave: true,
    },
    editor: {
      fontSize: 13,
      lineNumbers: true,
      suggestionDocs: true,
    },
    experiments: {
      enableNewRouter: true,
      enablePreviewDocs: true,
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
