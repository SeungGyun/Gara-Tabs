import { create } from 'zustand';
import type { Profile, Group, Tab, ProfileItem } from '../types';
import { generateId } from '../utils/uuid';
import { MAX_UNDO_HISTORY } from '../constants';

interface EditorState {
  currentProfile: Profile | null;
  selectedItemId: string | null;
  selectedItemType: 'group' | 'tab' | null;

  // 히스토리 (Undo/Redo)
  history: Profile[];
  historyIndex: number;

  // 액션
  setCurrentProfile: (profile: Profile) => void;
  selectItem: (id: string | null, type: 'group' | 'tab' | null) => void;

  // 프로필
  renameProfile: (name: string) => void;

  // 그룹 CRUD
  addGroup: (group: Omit<Group, 'id' | 'tabs'>) => void;
  updateGroup: (groupId: string, updates: Partial<Omit<Group, 'id' | 'tabs'>>) => void;
  deleteGroup: (groupId: string) => void;

  // 독립 탭 CRUD
  addStandaloneTab: (tab: Omit<Tab, 'id'>) => void;
  deleteStandaloneTab: (tabId: string) => void;

  // 아이템 재정렬 (그룹+독립탭 혼합)
  reorderItems: (fromIndex: number, toIndex: number) => void;

  // 그룹 내 탭 CRUD
  addTab: (groupId: string, tab: Omit<Tab, 'id'>) => void;
  updateTab: (groupId: string, tabId: string, updates: Partial<Omit<Tab, 'id'>>) => void;
  deleteTab: (groupId: string, tabId: string) => void;
  moveTab: (fromGroupId: string, toGroupId: string, tabId: string, newIndex: number) => void;

  // 독립 탭 ↔ 그룹 이동
  moveTabToGroup: (tabId: string, targetGroupId: string, newIndex: number) => void;
  moveTabToStandalone: (groupId: string, tabId: string, itemIndex: number) => void;

  // 독립 탭 속성 수정
  updateStandaloneTab: (tabId: string, updates: Partial<Omit<Tab, 'id'>>) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function pushHistory(state: EditorState): Partial<EditorState> {
  if (!state.currentProfile) return {};
  const newHistory = state.history.slice(0, state.historyIndex + 1);
  newHistory.push(structuredClone(state.currentProfile));
  if (newHistory.length > MAX_UNDO_HISTORY) newHistory.shift();
  return { history: newHistory, historyIndex: newHistory.length - 1 };
}

function withHistory(
  get: () => EditorState,
  set: (s: Partial<EditorState>) => void,
  mutate: (profile: Profile) => Profile,
) {
  const state = get();
  if (!state.currentProfile) return;
  const historyUpdate = pushHistory(state);
  const updated = mutate(structuredClone(state.currentProfile));
  updated.updatedAt = Date.now();
  set({ ...historyUpdate, currentProfile: updated });
}

// items에서 그룹 찾기
function findGroup(items: ProfileItem[], groupId: string): Group | undefined {
  for (const item of items) {
    if (item.kind === 'group' && item.group.id === groupId) return item.group;
  }
  return undefined;
}

export const useTabStore = create<EditorState>((set, get) => ({
  currentProfile: null,
  selectedItemId: null,
  selectedItemType: null,
  history: [],
  historyIndex: -1,

  setCurrentProfile: (profile) => {
    const clone = structuredClone(profile);
    set({
      currentProfile: clone,
      history: [clone],
      historyIndex: 0,
      selectedItemId: null,
      selectedItemType: null,
    });
  },

  selectItem: (id, type) => {
    set({ selectedItemId: id, selectedItemType: type });
  },

  // ── 프로필 ──

  renameProfile: (name) => {
    withHistory(get, set, (p) => {
      p.name = name;
      return p;
    });
  },

  // ── 그룹 CRUD ──

  addGroup: (group) => {
    withHistory(get, set, (p) => {
      p.items.push({ kind: 'group', group: { ...group, id: generateId(), tabs: [] } });
      return p;
    });
  },

  updateGroup: (groupId, updates) => {
    withHistory(get, set, (p) => {
      const g = findGroup(p.items, groupId);
      if (g) Object.assign(g, updates);
      return p;
    });
  },

  deleteGroup: (groupId) => {
    withHistory(get, set, (p) => {
      p.items = p.items.filter((i) => !(i.kind === 'group' && i.group.id === groupId));
      return p;
    });
    if (get().selectedItemId === groupId) {
      set({ selectedItemId: null, selectedItemType: null });
    }
  },

  // ── 독립 탭 CRUD ──

  addStandaloneTab: (tab) => {
    withHistory(get, set, (p) => {
      p.items.push({ kind: 'tab', tab: { ...tab, id: generateId() } });
      return p;
    });
  },

  deleteStandaloneTab: (tabId) => {
    withHistory(get, set, (p) => {
      p.items = p.items.filter((i) => !(i.kind === 'tab' && i.tab.id === tabId));
      return p;
    });
    if (get().selectedItemId === tabId) {
      set({ selectedItemId: null, selectedItemType: null });
    }
  },

  // ── 아이템 재정렬 ──

  reorderItems: (fromIndex, toIndex) => {
    withHistory(get, set, (p) => {
      const [moved] = p.items.splice(fromIndex, 1);
      p.items.splice(toIndex, 0, moved);
      return p;
    });
  },

  // ── 그룹 내 탭 CRUD ──

  addTab: (groupId, tab) => {
    withHistory(get, set, (p) => {
      const g = findGroup(p.items, groupId);
      if (g) g.tabs.push({ ...tab, id: generateId() });
      return p;
    });
  },

  updateTab: (groupId, tabId, updates) => {
    withHistory(get, set, (p) => {
      const g = findGroup(p.items, groupId);
      const t = g?.tabs.find((t) => t.id === tabId);
      if (t) Object.assign(t, updates);
      return p;
    });
  },

  deleteTab: (groupId, tabId) => {
    withHistory(get, set, (p) => {
      const g = findGroup(p.items, groupId);
      if (g) g.tabs = g.tabs.filter((t) => t.id !== tabId);
      return p;
    });
    if (get().selectedItemId === tabId) {
      set({ selectedItemId: null, selectedItemType: null });
    }
  },

  moveTab: (fromGroupId, toGroupId, tabId, newIndex) => {
    withHistory(get, set, (p) => {
      const fromGroup = findGroup(p.items, fromGroupId);
      const toGroup = findGroup(p.items, toGroupId);
      if (!fromGroup || !toGroup) return p;

      const tabIndex = fromGroup.tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return p;

      const [tab] = fromGroup.tabs.splice(tabIndex, 1);
      toGroup.tabs.splice(newIndex, 0, tab);
      return p;
    });
  },

  // ── 독립 탭 ↔ 그룹 이동 ──

  moveTabToGroup: (tabId, targetGroupId, newIndex) => {
    withHistory(get, set, (p) => {
      const itemIdx = p.items.findIndex((i) => i.kind === 'tab' && i.tab.id === tabId);
      if (itemIdx === -1) return p;
      const tab = (p.items[itemIdx] as { kind: 'tab'; tab: Tab }).tab;
      p.items.splice(itemIdx, 1);

      const group = findGroup(p.items, targetGroupId);
      if (group) group.tabs.splice(newIndex, 0, tab);
      return p;
    });
  },

  moveTabToStandalone: (groupId, tabId, itemIndex) => {
    withHistory(get, set, (p) => {
      const group = findGroup(p.items, groupId);
      if (!group) return p;
      const tabIdx = group.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return p;

      const [tab] = group.tabs.splice(tabIdx, 1);
      p.items.splice(itemIndex, 0, { kind: 'tab', tab });
      return p;
    });
  },

  updateStandaloneTab: (tabId, updates) => {
    withHistory(get, set, (p) => {
      const item = p.items.find((i) => i.kind === 'tab' && i.tab.id === tabId);
      if (item && item.kind === 'tab') Object.assign(item.tab, updates);
      return p;
    });
  },

  // ── Undo / Redo ──

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    set({
      currentProfile: structuredClone(history[newIndex]),
      historyIndex: newIndex,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    set({
      currentProfile: structuredClone(history[newIndex]),
      historyIndex: newIndex,
    });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
}));
