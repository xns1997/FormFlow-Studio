import { create } from 'zustand';
import { createDefaultSystemSettings, loadSystemSettings, saveSystemSettings, type SystemSettings } from '../services/config/systemSettings';
import { applyTheme, applyEditorFont } from '../services/config/themeUtils';

function applyAppearance(settings: SystemSettings): void {
  applyTheme(settings.appearance.theme);
  applyEditorFont(settings.appearance.editorFontFamily, settings.appearance.editorFontFamilyCustom);
}

interface SystemSettingsStore {
  settings: SystemSettings;
  loading: boolean;
  initSettings: () => void;
  setSettings: (settings: SystemSettings) => void;
  updateSettings: (updater: (current: SystemSettings) => SystemSettings) => void;
}

export const useSystemSettingsStore = create<SystemSettingsStore>((set) => ({
  settings: createDefaultSystemSettings(),
  loading: false,
  initSettings: () => {
    set({ loading: true });
    const settings = loadSystemSettings();
    applyAppearance(settings);
    set({ settings, loading: false });
  },
  setSettings: (settings) => {
    const saved = saveSystemSettings(settings);
    applyAppearance(saved);
    set({ settings: saved });
  },
  updateSettings: (updater) => set((state) => {
    const next = saveSystemSettings(updater(state.settings));
    applyAppearance(next);
    return { settings: next };
  }),
}));
