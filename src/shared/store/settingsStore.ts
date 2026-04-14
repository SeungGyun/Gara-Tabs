import { create } from 'zustand';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../types';
import { setUserLanguage } from '../i18n';

interface SettingsState {
  settings: Settings;
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  addCustomRule: (hostname: string, groupName: string) => Promise<void>;
  removeCustomRule: (hostname: string) => Promise<void>;
}

/**
 * 사용자 입력에서 규칙 키를 추출.
 * URL 형태면 hostname + path 첫 세그먼트를 반환.
 * 예: "https://nckorea.atlassian.net/jira/board" → "nckorea.atlassian.net/jira"
 *     "nckorea.atlassian.net/wiki" → "nckorea.atlassian.net/wiki"
 *     "google.com" → "google.com"
 */
function parseRuleKey(input: string): string {
  try {
    // URL 형태가 아니면 그대로 반환
    const url = input.includes('://') ? new URL(input) : new URL('https://' + input);
    const hostname = url.hostname;
    // path의 첫 세그먼트만 추출 (/jira/board → /jira)
    const pathSegments = url.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      return `${hostname}/${pathSegments[0]}`;
    }
    return hostname;
  } catch {
    return input;
  }
}

async function readSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEYS.SETTINGS] };
}

async function writeSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

function syncLanguage(settings: Settings) {
  setUserLanguage(settings.language ?? 'auto');
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    const settings = await readSettings();
    syncLanguage(settings);
    set({ settings, isLoading: false });
  },

  updateSettings: async (updates) => {
    const settings = { ...get().settings, ...updates };
    await writeSettings(settings);
    syncLanguage(settings);
    set({ settings });
  },

  addCustomRule: async (input, groupName) => {
    // URL이 입력되면 hostname + path 첫 세그먼트를 키로 추출
    const key = parseRuleKey(input);
    const settings = {
      ...get().settings,
      customDomainRules: { ...get().settings.customDomainRules, [key]: groupName },
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
      syncLanguage(newSettings);
      useSettingsStore.setState({ settings: newSettings });
    }
  });
}
