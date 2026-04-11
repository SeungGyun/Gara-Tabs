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

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  groups: Group[];
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
}

export const DEFAULT_SETTINGS: Settings = {
  subdomainMode: 'merge',
  customDomainRules: {},
  excludePatterns: ['chrome://', 'chrome-extension://', 'about:', 'edge://'],
  autoGroupEnabled: false,
  autoGroupRules: [],
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
  | { type: 'MOVE_GROUP'; groupId: number; targetIndex: number };
