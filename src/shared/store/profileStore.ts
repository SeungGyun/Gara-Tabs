import { create } from 'zustand';
import type { Profile, Group, Tab, ProfileSnapshot, ProfileItem } from '../types';
import { STORAGE_KEYS, PROFILE_HISTORY_RETENTION_MS, migrateProfile } from '../types';
import { generateId } from '../utils/uuid';
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
  const raw = data[STORAGE_KEYS.PROFILES] ?? [];
  // 이전 형식 자동 마이그레이션
  return raw.map(migrateProfile);
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
  const cutoff = Date.now() - PROFILE_HISTORY_RETENTION_MS;
  map[profile.id] = list.filter((s) => s.timestamp >= cutoff);
  await writeHistoryMap(map);
}

// ── 현재 탭 캡처 유틸 ──

function toProfileTab(tab: chrome.tabs.Tab): Tab {
  return {
    id: generateId(),
    url: tab.url ?? '',
    title: tab.title ?? '',
    favIconUrl: tab.favIconUrl ?? null,
    pinned: tab.pinned ?? false,
  };
}

async function captureTabsAsItems(): Promise<ProfileItem[]> {
  const currentWindow = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
  const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });

  const groupMap = new Map<number, chrome.tabGroups.TabGroup>();
  for (const g of groups) groupMap.set(g.id, g);

  // 인덱스 순으로 정렬
  const sorted = [...tabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const items: ProfileItem[] = [];
  let currentGroupId: number | null = null;
  let currentGroupTabs: Tab[] = [];
  let colorIndex = 0;

  const flushGroup = () => {
    if (currentGroupId !== null && currentGroupTabs.length > 0) {
      const chromeGroup = groupMap.get(currentGroupId);
      items.push({
        kind: 'group',
        group: {
          id: generateId(),
          name: chromeGroup?.title || `그룹 ${currentGroupId}`,
          color: (chromeGroup?.color as Group['color']) ?? assignColor(colorIndex++),
          domain: null,
          tabs: currentGroupTabs,
        },
      });
    }
    currentGroupId = null;
    currentGroupTabs = [];
  };

  for (const tab of sorted) {
    const gid = tab.groupId ?? -1;

    if (gid !== -1 && groupMap.has(gid)) {
      // 그룹 소속 탭
      if (gid === currentGroupId) {
        currentGroupTabs.push(toProfileTab(tab));
      } else {
        flushGroup();
        currentGroupId = gid;
        currentGroupTabs = [toProfileTab(tab)];
      }
    } else {
      // 독립 탭 (고정 탭 포함)
      flushGroup();
      items.push({ kind: 'tab', tab: toProfileTab(tab) });
    }
  }
  flushGroup();

  return items;
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
    const items = await captureTabsAsItems();
    const profile: Profile = {
      id: generateId(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      items,
    };
    await get().saveProfile(profile);
    return profile;
  },

  refreshFromTabs: async (profileId) => {
    const profile = get().profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const items = await captureTabsAsItems();
    const updated: Profile = {
      ...profile,
      items,
      updatedAt: Date.now(),
    };
    await get().saveProfile(updated);
  },

  // ── 히스토리 ──

  getHistory: async (profileId) => {
    const map = await readHistoryMap();
    const list = map[profileId] ?? [];
    // 히스토리도 마이그레이션
    return list.map((s) => ({ ...s, profile: migrateProfile(s.profile) }));
  },

  restoreFromHistory: async (profileId, timestamp) => {
    const map = await readHistoryMap();
    const list = map[profileId] ?? [];
    const snapshot = list.find((s) => s.timestamp === timestamp);
    if (!snapshot) return;

    const current = get().profiles.find((p) => p.id === profileId);
    if (current) await pushToHistory(current);

    const restored: Profile = {
      ...migrateProfile(snapshot.profile),
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
      const raw = changes[STORAGE_KEYS.PROFILES].newValue ?? [];
      const newProfiles = raw.map(migrateProfile);
      useProfileStore.setState({ profiles: newProfiles });
    }
  });
}
