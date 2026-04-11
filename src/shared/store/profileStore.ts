import { create } from 'zustand';
import type { Profile, Group, Tab, ProfileSnapshot } from '../types';
import { STORAGE_KEYS, MAX_PROFILE_HISTORY } from '../types';
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
  refreshFromTabs: (profileId: string) => Promise<void>;

  // 히스토리
  getHistory: (profileId: string) => Promise<ProfileSnapshot[]>;
  restoreFromHistory: (profileId: string, timestamp: number) => Promise<void>;
}

async function readProfiles(): Promise<Profile[]> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PROFILES);
  return data[STORAGE_KEYS.PROFILES] ?? [];
}

async function writeProfiles(profiles: Profile[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles });
}

// ── 히스토리 유틸 ──

type HistoryMap = Record<string, ProfileSnapshot[]>;

async function readHistoryMap(): Promise<HistoryMap> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PROFILE_HISTORY);
  return data[STORAGE_KEYS.PROFILE_HISTORY] ?? {};
}

async function writeHistoryMap(map: HistoryMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILE_HISTORY]: map });
}

async function pushToHistory(profile: Profile): Promise<void> {
  const map = await readHistoryMap();
  const list = map[profile.id] ?? [];
  list.unshift({ timestamp: Date.now(), profile: structuredClone(profile) });
  if (list.length > MAX_PROFILE_HISTORY) list.length = MAX_PROFILE_HISTORY;
  map[profile.id] = list;
  await writeHistoryMap(map);
}

// ── 현재 탭 캡처 유틸 ──

async function captureTabsAsGroups(): Promise<Group[]> {
  const currentWindow = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
  const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });

  const groupMap = new Map<number, chrome.tabGroups.TabGroup>();
  for (const g of groups) groupMap.set(g.id, g);

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

  if (pinned.length > 0) {
    profileGroups.push({
      id: generateId(),
      name: PINNED_GROUP_NAME,
      color: 'grey',
      domain: null,
      tabs: pinned.map(toProfileTab),
    });
  }

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

  if (ungrouped.length > 0) {
    profileGroups.push({
      id: generateId(),
      name: UNGROUPED_NAME,
      color: 'grey',
      domain: null,
      tabs: ungrouped.map(toProfileTab),
    });
  }

  return profileGroups;
}

function toProfileTab(tab: chrome.tabs.Tab): Tab {
  return {
    id: generateId(),
    url: tab.url ?? '',
    title: tab.title ?? '',
    favIconUrl: tab.favIconUrl ?? null,
    pinned: tab.pinned ?? false,
  };
}

// ── 스토어 ──

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
      // 변경 전 히스토리 저장
      await pushToHistory(profiles[idx]);
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
    // 히스토리도 정리
    const map = await readHistoryMap();
    delete map[id];
    await writeHistoryMap(map);
  },

  updateProfile: async (id, updates) => {
    const current = get().profiles.find((p) => p.id === id);
    if (current) await pushToHistory(current);

    const profiles = get().profiles.map((p) =>
      p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p,
    );
    await writeProfiles(profiles);
    set({ profiles });
  },

  captureCurrentTabs: async (name) => {
    const profileGroups = await captureTabsAsGroups();
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

  refreshFromTabs: async (profileId) => {
    const profile = get().profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const profileGroups = await captureTabsAsGroups();
    const updated: Profile = {
      ...profile,
      groups: profileGroups,
      updatedAt: Date.now(),
    };
    await get().saveProfile(updated);
  },

  // ── 히스토리 ──

  getHistory: async (profileId) => {
    const map = await readHistoryMap();
    return map[profileId] ?? [];
  },

  restoreFromHistory: async (profileId, timestamp) => {
    const map = await readHistoryMap();
    const list = map[profileId] ?? [];
    const snapshot = list.find((s) => s.timestamp === timestamp);
    if (!snapshot) return;

    // 현재 버전을 히스토리에 추가
    const current = get().profiles.find((p) => p.id === profileId);
    if (current) await pushToHistory(current);

    // 스냅샷으로 복원 (ID와 이름 유지)
    const restored: Profile = {
      ...snapshot.profile,
      id: profileId,
      updatedAt: Date.now(),
    };

    const profiles = get().profiles.map((p) =>
      p.id === profileId ? restored : p,
    );
    await writeProfiles(profiles);
    set({ profiles });
  },
}));

// 다른 컨텍스트에서 storage 변경 감지
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEYS.PROFILES]) {
      const newProfiles = changes[STORAGE_KEYS.PROFILES].newValue ?? [];
      useProfileStore.setState({ profiles: newProfiles });
    }
  });
}
