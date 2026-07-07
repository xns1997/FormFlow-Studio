import { create } from 'zustand';
import { createDefaultSystemSettings, loadSystemSettings, saveSystemSettings, type SystemSettings } from '../services/config/systemSettings';

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
    set({ settings, loading: false });
  },
  setSettings: (settings) => {
    const saved = saveSystemSettings(settings);
    set({ settings: saved });
  },
  updateSettings: (updater) => set((state) => {
    const next = saveSystemSettings(updater(state.settings));
    return { settings: next };
  }),
}));
