import { create } from 'zustand';
import type { Profile, Group, Tab } from '../types';
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

  // 그룹 CRUD
  addGroup: (group: Omit<Group, 'id' | 'tabs'>) => void;
  updateGroup: (groupId: string, updates: Partial<Omit<Group, 'id' | 'tabs'>>) => void;
  deleteGroup: (groupId: string) => void;
  reorderGroups: (fromIndex: number, toIndex: number) => void;

  // 탭 CRUD
  addTab: (groupId: string, tab: Omit<Tab, 'id'>) => void;
  updateTab: (groupId: string, tabId: string, updates: Partial<Omit<Tab, 'id'>>) => void;
  deleteTab: (groupId: string, tabId: string) => void;
  moveTab: (fromGroupId: string, toGroupId: string, tabId: string, newIndex: number) => void;

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

  // ── 그룹 CRUD ──

  addGroup: (group) => {
    withHistory(get, set, (p) => {
      p.groups.push({ ...group, id: generateId(), tabs: [] });
      return p;
    });
  },

  updateGroup: (groupId, updates) => {
    withHistory(get, set, (p) => {
      const g = p.groups.find((g) => g.id === groupId);
      if (g) Object.assign(g, updates);
      return p;
    });
  },

  deleteGroup: (groupId) => {
    withHistory(get, set, (p) => {
      p.groups = p.groups.filter((g) => g.id !== groupId);
      return p;
    });
    const state = get();
    if (state.selectedItemId === groupId) {
      set({ selectedItemId: null, selectedItemType: null });
    }
  },

  reorderGroups: (fromIndex, toIndex) => {
    withHistory(get, set, (p) => {
      const [moved] = p.groups.splice(fromIndex, 1);
      p.groups.splice(toIndex, 0, moved);
      return p;
    });
  },

  // ── 탭 CRUD ──

  addTab: (groupId, tab) => {
    withHistory(get, set, (p) => {
      const g = p.groups.find((g) => g.id === groupId);
      if (g) g.tabs.push({ ...tab, id: generateId() });
      return p;
    });
  },

  updateTab: (groupId, tabId, updates) => {
    withHistory(get, set, (p) => {
      const g = p.groups.find((g) => g.id === groupId);
      const t = g?.tabs.find((t) => t.id === tabId);
      if (t) Object.assign(t, updates);
      return p;
    });
  },

  deleteTab: (groupId, tabId) => {
    withHistory(get, set, (p) => {
      const g = p.groups.find((g) => g.id === groupId);
      if (g) g.tabs = g.tabs.filter((t) => t.id !== tabId);
      return p;
    });
    const state = get();
    if (state.selectedItemId === tabId) {
      set({ selectedItemId: null, selectedItemType: null });
    }
  },

  moveTab: (fromGroupId, toGroupId, tabId, newIndex) => {
    withHistory(get, set, (p) => {
      const fromGroup = p.groups.find((g) => g.id === fromGroupId);
      const toGroup = p.groups.find((g) => g.id === toGroupId);
      if (!fromGroup || !toGroup) return p;

      const tabIndex = fromGroup.tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return p;

      const [tab] = fromGroup.tabs.splice(tabIndex, 1);
      toGroup.tabs.splice(newIndex, 0, tab);
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
