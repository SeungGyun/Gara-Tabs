import { create } from 'zustand';
import type { Profile, Group, Tab } from '../types';
import { STORAGE_KEYS } from '../types';
import { generateId } from '../utils/uuid';
import { UNGROUPED_NAME, PINNED_GROUP_NAME } from '../constants';
import { assignColor } from '../utils/colors';

interface ProfileState {
  profiles: Profile[];
  isLoading: boolean;

  loadProfiles: () => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  updateProfile: (id: string, updates: Partial<Profile>) => Promise<void>;
  captureCurrentTabs: (name: string) => Promise<Profile>;
}

async function readProfiles(): Promise<Profile[]> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PROFILES);
  return data[STORAGE_KEYS.PROFILES] ?? [];
}

async function writeProfiles(profiles: Profile[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles });
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  isLoading: false,

  loadProfiles: async () => {
    set({ isLoading: true });
    const profiles = await readProfiles();
    set({ profiles, isLoading: false });
  },

  saveProfile: async (profile) => {
    const profiles = [...get().profiles];
    const idx = profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      profiles[idx] = profile;
    } else {
      profiles.push(profile);
    }
    await writeProfiles(profiles);
    set({ profiles });
  },

  deleteProfile: async (id) => {
    const profiles = get().profiles.filter((p) => p.id !== id);
    await writeProfiles(profiles);
    set({ profiles });
  },

  updateProfile: async (id, updates) => {
    const profiles = get().profiles.map((p) =>
      p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p,
    );
    await writeProfiles(profiles);
    set({ profiles });
  },

  captureCurrentTabs: async (name) => {
    const currentWindow = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
    const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });

    // 그룹 맵 생성
    const groupMap = new Map<number, chrome.tabGroups.TabGroup>();
    for (const g of groups) groupMap.set(g.id, g);

    // 탭을 그룹별로 분류
    const grouped = new Map<number, chrome.tabs.Tab[]>();
    const ungrouped: chrome.tabs.Tab[] = [];
    const pinned: chrome.tabs.Tab[] = [];

    for (const tab of tabs) {
      if (tab.pinned) {
        pinned.push(tab);
      } else if (tab.groupId && tab.groupId !== -1) {
        const list = grouped.get(tab.groupId) ?? [];
        list.push(tab);
        grouped.set(tab.groupId, list);
      } else {
        ungrouped.push(tab);
      }
    }

    const profileGroups: Group[] = [];
    let colorIndex = 0;

    // 고정 탭 그룹
    if (pinned.length > 0) {
      profileGroups.push({
        id: generateId(),
        name: PINNED_GROUP_NAME,
        color: 'grey',
        domain: null,
        tabs: pinned.map(toProfileTab),
      });
    }

    // Chrome 그룹 유지
    for (const [groupId, groupTabs] of grouped) {
      const chromeGroup = groupMap.get(groupId);
      profileGroups.push({
        id: generateId(),
        name: chromeGroup?.title || `그룹 ${groupId}`,
        color: (chromeGroup?.color as Group['color']) ?? assignColor(colorIndex++),
        domain: null,
        tabs: groupTabs.map(toProfileTab),
      });
    }

    // 미분류 탭
    if (ungrouped.length > 0) {
      profileGroups.push({
        id: generateId(),
        name: UNGROUPED_NAME,
        color: 'grey',
        domain: null,
        tabs: ungrouped.map(toProfileTab),
      });
    }

    const profile: Profile = {
      id: generateId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      groups: profileGroups,
    };

    await get().saveProfile(profile);
    return profile;
  },
}));

function toProfileTab(tab: chrome.tabs.Tab): Tab {
  return {
    id: generateId(),
    url: tab.url ?? '',
    title: tab.title ?? '',
    favIconUrl: tab.favIconUrl ?? null,
    pinned: tab.pinned ?? false,
  };
}

// 다른 컨텍스트(Side Panel / Editor)에서 storage 변경 감지
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.PROFILES]) {
      const newProfiles = changes[STORAGE_KEYS.PROFILES].newValue ?? [];
      useProfileStore.setState({ profiles: newProfiles });
    }
  });
}
