// ============================================================
// 핵심 데이터 모델
// ============================================================

export interface Tab {
  id: string;
  url: string;
  title: string;
  favIconUrl: string | null;
  pinned: boolean;
}

export interface Group {
  id: string;
  name: string;
  color: ChromeTabGroupColor;
  domain: string | null;
  tabs: Tab[];
}

export type ProfileItem =
  | { kind: 'group'; group: Group }
  | { kind: 'tab'; tab: Tab };

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  items: ProfileItem[];
}

// ── 프로필 헬퍼 함수 ──

export function profileAllTabs(profile: Profile): Tab[] {
  return profile.items.flatMap((i) => (i.kind === 'group' ? i.group.tabs : [i.tab]));
}

export function profileGroups(profile: Profile): Group[] {
  return profile.items
    .filter((i): i is { kind: 'group'; group: Group } => i.kind === 'group')
    .map((i) => i.group);
}

export function profileTabCount(profile: Profile): number {
  return profile.items.reduce(
    (sum, i) => sum + (i.kind === 'group' ? i.group.tabs.length : 1),
    0,
  );
}

export function profileGroupCount(profile: Profile): number {
  return profile.items.filter((i) => i.kind === 'group').length;
}

// ── 저장 데이터 마이그레이션 ──

const LEGACY_UNGROUPED = '미분류';
const LEGACY_PINNED = '📌 고정 탭';

/** 이전 형식(groups[]) → 새 형식(items[]) 자동 변환 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateProfile(raw: any): Profile {
  if (raw.items && Array.isArray(raw.items)) return raw as Profile;

  // 이전 형식: groups[]
  const items: ProfileItem[] = [];
  for (const group of raw.groups ?? []) {
    if (group.name === LEGACY_UNGROUPED || group.name === LEGACY_PINNED) {
      for (const tab of group.tabs ?? []) {
        items.push({ kind: 'tab', tab });
      }
    } else {
      items.push({ kind: 'group', group });
    }
  }
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    items,
  };
}

// ============================================================
// Chrome 탭 그룹 색상 (chrome.tabGroups.Color)
// ============================================================

export type ChromeTabGroupColor =
  | 'grey' | 'blue' | 'red' | 'yellow'
  | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

export const TAB_GROUP_COLORS: ChromeTabGroupColor[] = [
  'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey',
];

// ============================================================
// 설정
// ============================================================

export type SubdomainMode = 'merge' | 'split' | 'custom';

export interface AutoGroupRule {
  id: string;
  pattern: string;       // URL 패턴 (contains 매칭)
  groupName: string;     // 배정할 그룹 이름
  color: ChromeTabGroupColor;
  enabled: boolean;
}

export interface Settings {
  subdomainMode: SubdomainMode;
  customDomainRules: Record<string, string>;
  excludePatterns: string[];
  autoGroupEnabled: boolean;
  autoGroupRules: AutoGroupRule[];
  language: string; // 'auto' | 'ko' | 'en' | 'ja' | 'zh-CN' | 'es' | 'fr' | 'de' | 'pt-BR'
}

export const DEFAULT_SETTINGS: Settings = {
  subdomainMode: 'merge',
  customDomainRules: {},
  excludePatterns: ['chrome://', 'chrome-extension://', 'about:', 'edge://'],
  autoGroupEnabled: false,
  autoGroupRules: [],
  language: 'auto',
};

// ============================================================
// 프로필 불러오기 옵션
// ============================================================

export type LoadProfileOption =
  | 'close_existing'
  | 'keep_as_group'
  | 'cancel';

// ============================================================
// 스토리지 키
// ============================================================

export interface ProfileSnapshot {
  timestamp: number;
  profile: Profile;
}

export const STORAGE_KEYS = {
  PROFILES: 'tab_manager_profiles',
  SETTINGS: 'tab_manager_settings',
  PROFILE_HISTORY: 'tab_manager_profile_history',
} as const;

export const PROFILE_HISTORY_RETENTION_MS = 2 * 24 * 60 * 60 * 1000; // 2일

// ============================================================
// 메시지 타입 (Background ↔ Side Panel / Editor)
// ============================================================

export type MessageType =
  | { type: 'COLLECT_TABS' }
  | { type: 'GROUP_BY_DOMAIN'; settings: Settings }
  | { type: 'LOAD_PROFILE'; profileId: string; option: LoadProfileOption }
  | { type: 'REMOVE_DUPLICATES'; keepTabIds: number[] }
  | { type: 'OPEN_EDITOR'; profileId?: string }
  | { type: 'GET_CURRENT_TABS' }
  | { type: 'SAVE_PROFILE'; name: string }
  | { type: 'CLOSE_COLLAPSED_GROUPS' }
  | { type: 'MOVE_TAB'; tabId: number; targetIndex: number; targetGroupId?: number }
  | { type: 'MOVE_GROUP'; groupId: number; targetIndex: number }
  | { type: 'CREATE_GROUP'; title: string }
  | { type: 'RENAME_GROUP'; groupId: number; title: string };
