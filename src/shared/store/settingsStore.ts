import { create } from 'zustand';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../types';

interface SettingsState {
  settings: Settings;
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  addCustomRule: (hostname: string, groupName: string) => Promise<void>;
  removeCustomRule: (hostname: string) => Promise<void>;
}

async function readSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEYS.SETTINGS] };
}

async function writeSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    const settings = await readSettings();
    set({ settings, isLoading: false });
  },

  updateSettings: async (updates) => {
    const settings = { ...get().settings, ...updates };
    await writeSettings(settings);
    set({ settings });
  },

  addCustomRule: async (hostname, groupName) => {
    const settings = {
      ...get().settings,
      customDomainRules: { ...get().settings.customDomainRules, [hostname]: groupName },
    };
    await writeSettings(settings);
    set({ settings });
  },

  removeCustomRule: async (hostname) => {
    const { [hostname]: _, ...rest } = get().settings.customDomainRules;
    const settings = { ...get().settings, customDomainRules: rest };
    await writeSettings(settings);
    set({ settings });
  },
}));

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.SETTINGS]) {
      const newSettings = { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEYS.SETTINGS].newValue };
      useSettingsStore.setState({ settings: newSettings });
    }
  });
}
