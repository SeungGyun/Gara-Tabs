# Tab Manager Pro — Chrome Extension 개발 명세서

> **이 문서는 Claude Code가 개발에 사용할 전체 명세입니다.**
> 모든 기능, 데이터 구조, UI 구조, 기술 스택이 포함되어 있으며, 이 문서를 기반으로 구현합니다.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | Tab Manager Pro |
| 타입 | Chrome Extension (Manifest V3) |
| UI 방식 | 하이브리드 — Side Panel (일상 조작) + 별도 탭 페이지 (에디터) |
| 프레임워크 | React 18+ / TypeScript |
| 빌드 도구 | Vite + CRXJS |
| 상태 관리 | Zustand |
| 스타일링 | Tailwind CSS |
| 드래그앤드롭 | dnd-kit |
| 테스트 | Vitest + React Testing Library |

---

## 2. 디렉토리 구조

```
tab-manager-pro/
├── manifest.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
│
├── src/
│   ├── background/
│   │   └── index.ts                  # Service Worker (이벤트 리스너, 탭/그룹 조작 로직)
│   │
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.tsx                  # Side Panel 엔트리
│   │   ├── App.tsx
│   │   └── components/
│   │       ├── ActionBar.tsx         # 상단 액션 버튼 (모으기, 그룹화, 중복제거)
│   │       ├── CurrentTabsView.tsx   # 현재 창의 그룹/탭 트리
│   │       ├── ProfileSection.tsx    # 프로필 저장/목록/불러오기
│   │       ├── ProfileListItem.tsx   # 프로필 아코디언 아이템
│   │       ├── DuplicateDetector.tsx # 중복 탭 감지 UI
│   │       └── SettingsPanel.tsx     # 하단 설정 영역
│   │
│   ├── editor/
│   │   ├── index.html
│   │   ├── main.tsx                  # 에디터 페이지 엔트리
│   │   ├── App.tsx
│   │   └── components/
│   │       ├── Sidebar.tsx           # 좌측 프로필 목록
│   │       ├── EditorArea.tsx        # 중앙 그룹/탭 편집 영역
│   │       ├── PropertyPanel.tsx     # 우측 속성 편집 패널
│   │       ├── Toolbar.tsx           # 상단 툴바 (저장, undo/redo)
│   │       ├── DraggableGroup.tsx    # 드래그 가능한 그룹 컴포넌트
│   │       └── DraggableTab.tsx      # 드래그 가능한 탭 컴포넌트
│   │
│   ├── shared/
│   │   ├── types/
│   │   │   └── index.ts             # 전체 타입 정의
│   │   ├── store/
│   │   │   ├── profileStore.ts      # 프로필 CRUD Zustand 스토어
│   │   │   ├── tabStore.ts          # 현재 탭 상태 스토어
│   │   │   └── settingsStore.ts     # 설정 스토어
│   │   ├── hooks/
│   │   │   ├── useChromeTabs.ts     # Chrome tabs API 래핑 훅
│   │   │   ├── useTabGroups.ts      # Chrome tabGroups API 래핑 훅
│   │   │   ├── useStorage.ts        # chrome.storage 래핑 훅
│   │   │   └── useDomainGrouping.ts # 도메인 그룹화 로직 훅
│   │   ├── utils/
│   │   │   ├── domain.ts            # 도메인 파싱, 서브도메인 처리
│   │   │   ├── uuid.ts              # UUID 생성
│   │   │   ├── colors.ts            # 탭 그룹 색상 순환 배정
│   │   │   └── dedup.ts             # URL 정규화, 중복 감지
│   │   └── constants.ts             # 상수 정의
│   │
│   └── assets/
│       └── icons/                   # 확장 프로그램 아이콘 (16, 48, 128px)
│
└── tests/
    ├── unit/
    │   ├── domain.test.ts
    │   ├── dedup.test.ts
    │   └── profileStore.test.ts
    └── integration/
        └── tabOperations.test.ts
```

---

## 3. 타입 정의 (`src/shared/types/index.ts`)

```typescript
// ============================================================
// 핵심 데이터 모델
// ============================================================

export interface Tab {
  id: string;             // UUID
  url: string;
  title: string;
  favIconUrl: string | null;
  pinned: boolean;
}

export interface Group {
  id: string;             // UUID
  name: string;
  color: ChromeTabGroupColor;
  domain: string | null;  // 자동 그룹화 시 연결된 도메인
  tabs: Tab[];
}

export interface Profile {
  id: string;             // UUID
  name: string;
  createdAt: number;      // Date.now()
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
  'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'
];

// ============================================================
// 설정
// ============================================================

export type SubdomainMode = 'merge' | 'split' | 'custom';

export interface Settings {
  subdomainMode: SubdomainMode;
  customDomainRules: Record<string, string>;
  // 예: { "mail.google.com": "Google", "docs.google.com": "Google" }
  excludePatterns: string[];
  // 예: ["chrome://", "chrome-extension://", "about:"]
}

export const DEFAULT_SETTINGS: Settings = {
  subdomainMode: 'merge',
  customDomainRules: {},
  excludePatterns: ['chrome://', 'chrome-extension://', 'about:', 'edge://']
};

// ============================================================
// 프로필 불러오기 옵션
// ============================================================

export type LoadProfileOption =
  | 'close_existing'    // 기존 탭 모두 닫기
  | 'keep_as_group'     // 기존 탭 유지 + '기존 탭' 그룹으로 묶기
  | 'cancel';           // 취소

// ============================================================
// 스토리지 키
// ============================================================

export const STORAGE_KEYS = {
  PROFILES: 'tab_manager_profiles',
  SETTINGS: 'tab_manager_settings',
} as const;
```

---

## 4. 기능 명세 (구현 상세)

### 4.1 탭 모으기 (Collect Tabs)

**파일**: `src/background/index.ts` + `src/shared/hooks/useChromeTabs.ts`

**동작 흐름**:

1. `chrome.windows.getAll({ populate: true })` 로 모든 창과 탭 정보 가져오기
2. 현재 활성 창 ID 확인 (`chrome.windows.getCurrent()`)
3. 시크릿 창 (`window.incognito === true`) 의 탭은 **별도 배열**로 분리 — 시크릿 창은 건드리지 않음
4. 고정 탭 (`tab.pinned === true`) 은 **별도 배열**로 분리
5. `chrome://`, `chrome-extension://` 등 excludePatterns에 해당하는 탭은 **별도 배열**로 분리
6. 나머지 일반 탭을 현재 창으로 이동: `chrome.tabs.move(tabId, { windowId: currentWindowId, index: -1 })`
7. 빈 창 닫기: `chrome.windows.remove(windowId)`
8. 이동 완료 후 도메인별 그룹화 자동 실행 (4.2)
9. 고정 탭 → "📌 고정 탭" 그룹으로 묶기
10. 시크릿 탭 정보 → Side Panel에 안내 메시지 표시 (직접 이동 불가)

**주의사항**:
- `chrome.tabs.move()` 는 시크릿 ↔ 일반 창 간 이동 불가. 시크릿 탭은 이동하지 않고 정보만 표시
- 이동 시 탭 순서 유지 (원래 창에서의 index 순)
- 에러 핸들링: 이미 닫힌 탭, 권한 없는 탭 등 graceful 처리

---

### 4.2 도메인별 그룹화 (Group by Domain)

**파일**: `src/shared/hooks/useDomainGrouping.ts` + `src/shared/utils/domain.ts`

**domain.ts 유틸리티**:

```typescript
/**
 * URL에서 도메인 추출
 * subdomainMode에 따라 다르게 처리
 */
export function extractDomain(url: string, mode: SubdomainMode, customRules: Record<string, string>): string | null {
  // 1. excludePatterns 체크 → null 반환
  // 2. URL 파싱 (new URL())
  // 3. hostname 추출
  // 4. custom 모드: customRules에 hostname이 있으면 해당 그룹명 반환
  // 5. merge 모드: TLD+1 추출 (예: mail.google.com → google.com)
  //    - public suffix list 고려 (co.kr, com.au 등)
  //    - 간단 구현: 마지막 2단계 추출, 알려진 ccTLD는 3단계
  // 6. split 모드: 전체 hostname 반환
}

// 알려진 복합 TLD 목록
const COMPOUND_TLDS = ['co.kr', 'co.jp', 'co.uk', 'com.au', 'com.br', 'ne.jp', 'or.kr', 'or.jp'];
```

**그룹화 흐름**:

1. 현재 창의 모든 탭 가져오기: `chrome.tabs.query({ currentWindow: true })`
2. 각 탭의 도메인 추출 (`extractDomain`)
3. 도메인별로 탭 분류 (Map<string, chrome.tabs.Tab[]>)
4. 탭이 1개뿐인 도메인은 그룹화하지 않음 (선택적)
5. 각 도메인 그룹에 대해:
   - `chrome.tabs.group({ tabIds: [...] })` 로 Chrome 탭 그룹 생성
   - `chrome.tabGroups.update(groupId, { title: domainName, color: assignedColor })` 로 이름/색상 설정
6. 색상 할당: `TAB_GROUP_COLORS` 배열에서 순환 배정

---

### 4.3 프로필 저장 (Save Profile)

**파일**: `src/shared/store/profileStore.ts`

**동작 흐름**:

1. 사용자가 Side Panel에서 "프로필 저장" 클릭
2. 프로필 이름 입력 다이얼로그 표시
3. 동일 이름 프로필 존재 시 덮어쓰기 확인 다이얼로그
4. 현재 창의 탭 그룹 정보 수집:
   - `chrome.tabGroups.query({ windowId: currentWindowId })` → 그룹 목록
   - `chrome.tabs.query({ currentWindow: true })` → 탭 목록
   - 각 탭의 `groupId` 로 그룹에 매핑
   - 그룹에 속하지 않은 탭은 "미분류" 그룹으로
5. Profile 객체 생성 (types에 정의된 스키마)
6. `chrome.storage.local.set()` 로 저장

**스토리지 구조**:

```typescript
// chrome.storage.local 에 저장되는 형태
{
  "tab_manager_profiles": Profile[],
  "tab_manager_settings": Settings
}
```

---

### 4.4 프로필 불러오기 (Load Profile)

**동작 흐름**:

1. 사용자가 프로필 목록에서 "불러오기" 클릭
2. 다이얼로그 표시: 3가지 옵션
   - **기존 탭 닫기**: 현재 창의 모든 탭 닫고 프로필 탭만 열기
   - **기존 탭 유지**: 현재 탭들을 "기존 탭" 그룹으로 묶고, 프로필 탭 추가
   - **취소**: 아무 동작 없음
3. 옵션 2 선택 시:
   - 이미 열려있는 URL과 프로필 내 URL 비교 → 중복 건너뛰기
4. 프로필의 각 그룹에 대해:
   - 그룹 내 탭 URL들을 `chrome.tabs.create()` 로 생성
   - 생성된 탭들을 `chrome.tabs.group()` 으로 묶기
   - `chrome.tabGroups.update()` 로 이름/색상 적용

---

### 4.5 프로필 목록 (Profile List)

**파일**: `src/sidepanel/components/ProfileSection.tsx` + `ProfileListItem.tsx`

**UI 구성**:

- 프로필별 아코디언 아이템:
  - 접힌 상태: 프로필 이름, 그룹 수, 탭 수, 생성일
  - 펼친 상태: 하위 그룹 목록 → 각 그룹 내 탭 목록 (URL + 제목)
- 각 프로필에 액션 버튼: 불러오기 | 에디터 열기 | 삭제
- 상단 검색바: 프로필 이름, 탭 URL/제목으로 필터링

---

### 4.6 프로필 에디터 (Profile Editor)

**파일**: `src/editor/` 전체

**레이아웃** (3단 구조):

```
┌──────────────────────────────────────────────────────────┐
│  Toolbar: [저장] [Undo] [Redo] [현재 탭에서 가져오기]       │
├────────────┬───────────────────────────┬─────────────────┤
│            │                           │                 │
│  Sidebar   │     Editor Area           │  Property Panel │
│            │                           │                 │
│  프로필1    │  ┌─ 그룹: Google (blue) ─┐ │  선택된 항목     │
│  프로필2 ←  │  │  ☰ Google Docs        │ │  - 이름: ___   │
│  프로필3    │  │  ☰ Gmail              │ │  - 색상: ___   │
│            │  └──────────────────────┘ │  - URL: ___    │
│  [+ 추가]  │  ┌─ 그룹: Naver (green) ─┐ │                 │
│            │  │  ☰ 네이버 뉴스         │ │                 │
│            │  │  ☰ 네이버 메일         │ │                 │
│            │  └──────────────────────┘ │                 │
│            │                           │                 │
│            │  [+ 그룹 추가] [+ 탭 추가]  │                 │
├────────────┴───────────────────────────┴─────────────────┤
```

**에디터 기능 상세**:

| 기능 | 구현 방식 |
|------|----------|
| 그룹 추가 | 이름, 색상 입력 모달 → groups 배열에 push |
| 그룹 수정 | 클릭 시 Property Panel에 편집 폼 표시 |
| 그룹 삭제 | 확인 다이얼로그 → groups 배열에서 제거 |
| 탭 추가 | URL 직접 입력 또는 "현재 열린 탭에서 선택" 모달 |
| 탭 수정 | 클릭 시 Property Panel에 URL/제목 편집 |
| 탭 삭제 | 개별 삭제 + 체크박스 다중 선택 후 일괄 삭제 |
| 탭 이동 (그룹 간) | dnd-kit 드래그앤드롭: 탭을 다른 그룹으로 드래그 |
| 그룹 순서 변경 | dnd-kit 드래그앤드롭: 그룹 전체를 위/아래로 드래그 |
| Undo/Redo | 상태 히스토리 스택 관리 (최대 50단계) |

**dnd-kit 구현 가이드**:

```typescript
// 그룹 간 탭 이동 + 그룹 순서 변경을 모두 지원하려면
// DndContext에 multiple sortable containers 패턴 사용
//
// - 각 Group = SortableContext (탭 정렬용)
// - 전체 Group 목록 = 또 다른 SortableContext (그룹 순서용)
// - onDragEnd에서 source/destination container 비교하여
//   같은 그룹 내 이동인지, 그룹 간 이동인지 판별
```

---

### 4.7 중복 탭 감지/제거 (Duplicate Detection)

**파일**: `src/shared/utils/dedup.ts` + `src/sidepanel/components/DuplicateDetector.tsx`

**dedup.ts**:

```typescript
/**
 * URL 정규화: 비교를 위해 URL을 표준화
 */
export function normalizeUrl(url: string): string {
  // 1. URL 파싱
  // 2. hash 제거 (#section)
  // 3. trailing slash 제거
  // 4. 쿼리 파라미터 정렬 (선택적)
  // 5. www. 제거 (선택적)
  // 6. 프로토콜 통일 (http → https) (선택적)
  // 소문자 변환
}

/**
 * 중복 탭 그룹 찾기
 * @returns Map<normalizedUrl, chrome.tabs.Tab[]> (2개 이상만)
 */
export function findDuplicates(tabs: chrome.tabs.Tab[]): Map<string, chrome.tabs.Tab[]> {
  // normalizeUrl로 그룹화 후 2개 이상인 것만 반환
}
```

**UI**:

- "중복 탭 정리" 버튼 클릭 시 스캔
- 중복 그룹별로 목록 표시 (어떤 탭을 남길지 라디오 버튼)
- "선택한 중복 제거" 버튼으로 일괄 닫기
- 결과 요약: "N개의 중복 탭을 닫았습니다"

---

## 5. manifest.json

```json
{
  "manifest_version": 3,
  "name": "Tab Manager Pro",
  "version": "1.0.0",
  "description": "탭을 모으고, 도메인별로 그룹화하고, 프로필로 저장/복원하세요.",
  "permissions": [
    "tabs",
    "tabGroups",
    "storage",
    "sidePanel",
    "activeTab"
  ],
  "background": {
    "service_worker": "src/background/index.ts"
  },
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "action": {
    "default_title": "Tab Manager Pro",
    "default_icon": {
      "16": "src/assets/icons/icon16.png",
      "48": "src/assets/icons/icon48.png",
      "128": "src/assets/icons/icon128.png"
    }
  },
  "icons": {
    "16": "src/assets/icons/icon16.png",
    "48": "src/assets/icons/icon48.png",
    "128": "src/assets/icons/icon128.png"
  }
}
```

> **참고**: CRXJS를 사용하면 manifest.json에서 직접 `.ts`, `.tsx` 파일을 참조할 수 있고, 빌드 시 자동 변환됩니다.

---

## 6. Background Service Worker 핵심 로직

**파일**: `src/background/index.ts`

```typescript
// ===== 확장 프로그램 아이콘 클릭 시 Side Panel 열기 =====
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ===== 메시지 핸들러 (Side Panel ↔ Background 통신) =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'COLLECT_TABS':
      // 탭 모으기 로직 실행
      collectAllTabs().then(sendResponse);
      return true; // 비동기 응답

    case 'GROUP_BY_DOMAIN':
      // 도메인별 그룹화 실행
      groupTabsByDomain(message.settings).then(sendResponse);
      return true;

    case 'LOAD_PROFILE':
      // 프로필 불러오기
      loadProfile(message.profileId, message.option).then(sendResponse);
      return true;

    case 'REMOVE_DUPLICATES':
      // 중복 탭 제거
      removeDuplicateTabs(message.keepTabIds).then(sendResponse);
      return true;

    case 'OPEN_EDITOR':
      // 에디터 페이지 열기
      chrome.tabs.create({ url: chrome.runtime.getURL('src/editor/index.html') });
      break;
  }
});
```

**통신 패턴**: Side Panel/Editor → `chrome.runtime.sendMessage()` → Background → Chrome API 호출 → 결과 반환

---

## 7. Zustand 스토어 설계

### profileStore.ts

```typescript
interface ProfileState {
  profiles: Profile[];
  isLoading: boolean;

  // CRUD
  loadProfiles: () => Promise<void>;           // storage에서 불러오기
  saveProfile: (profile: Profile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  updateProfile: (id: string, updates: Partial<Profile>) => Promise<void>;

  // 현재 탭 → 프로필 변환
  captureCurrentTabs: (name: string) => Promise<Profile>;
}
```

### settingsStore.ts

```typescript
interface SettingsState {
  settings: Settings;
  isLoading: boolean;

  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  addCustomRule: (hostname: string, groupName: string) => Promise<void>;
  removeCustomRule: (hostname: string) => Promise<void>;
}
```

### tabStore.ts (에디터용)

```typescript
interface EditorState {
  currentProfile: Profile | null;
  selectedItemId: string | null;      // 선택된 그룹 또는 탭 ID
  selectedItemType: 'group' | 'tab' | null;

  // 히스토리 (Undo/Redo)
  history: Profile[];
  historyIndex: number;

  // 액션
  setCurrentProfile: (profile: Profile) => void;
  selectItem: (id: string, type: 'group' | 'tab') => void;

  // 그룹 CRUD
  addGroup: (group: Omit<Group, 'id'>) => void;
  updateGroup: (groupId: string, updates: Partial<Group>) => void;
  deleteGroup: (groupId: string) => void;
  reorderGroups: (fromIndex: number, toIndex: number) => void;

  // 탭 CRUD
  addTab: (groupId: string, tab: Omit<Tab, 'id'>) => void;
  updateTab: (groupId: string, tabId: string, updates: Partial<Tab>) => void;
  deleteTab: (groupId: string, tabId: string) => void;
  moveTab: (fromGroupId: string, toGroupId: string, tabId: string, newIndex: number) => void;

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}
```

---

## 8. Chrome API 사용 가이드

### 자주 쓰는 API

```typescript
// 모든 창과 탭 가져오기
const windows = await chrome.windows.getAll({ populate: true });

// 현재 창 가져오기
const currentWindow = await chrome.windows.getCurrent();

// 탭 이동 (다른 창 → 현재 창)
await chrome.tabs.move(tabId, { windowId: currentWindow.id, index: -1 });

// 탭 그룹 생성
const groupId = await chrome.tabs.group({ tabIds: [tab1Id, tab2Id] });

// 탭 그룹 이름/색상 설정
await chrome.tabGroups.update(groupId, { title: 'Google', color: 'blue' });

// 탭 생성
const newTab = await chrome.tabs.create({ url: 'https://google.com', active: false });

// 탭 닫기
await chrome.tabs.remove(tabId);
// 여러 탭 닫기
await chrome.tabs.remove([tabId1, tabId2, tabId3]);

// 빈 창 닫기
await chrome.windows.remove(windowId);

// 스토리지 읽기/쓰기
const data = await chrome.storage.local.get('tab_manager_profiles');
await chrome.storage.local.set({ tab_manager_profiles: profiles });
```

### 주의사항

- `chrome.tabs.move()` 는 시크릿 ↔ 일반 창 간 이동 불가
- `chrome.tabs.group()` 은 같은 창 내의 탭만 그룹화 가능 → 먼저 move 후 group
- `chrome.tabGroups.update()` 의 color는 소문자 문자열 (대문자 X)
- Service Worker는 비활성화될 수 있으므로 상태를 메모리에 보관하지 말고 항상 storage 사용
- `chrome.tabs.create()` 를 대량 호출 시 순차 실행 권장 (병렬 호출 시 순서 보장 안됨)

---

## 9. 개발 순서 (Phase별)

### Phase 1: MVP (3~4주)

```
1. 프로젝트 셋업
   - Vite + CRXJS + React + TypeScript 프로젝트 초기화
   - Tailwind CSS 설정
   - manifest.json 작성
   - 디렉토리 구조 생성

2. Background Service Worker
   - 메시지 핸들러 기본 구조
   - collectAllTabs() 구현
   - groupTabsByDomain() 구현 (merge 모드만)

3. Side Panel 기본 UI
   - ActionBar (모으기, 그룹화, 중복제거 버튼)
   - CurrentTabsView (현재 탭/그룹 트리)

4. 프로필 저장/불러오기
   - profileStore (Zustand + chrome.storage)
   - 저장 다이얼로그
   - 불러오기 다이얼로그 (3가지 옵션)
   - ProfileSection + ProfileListItem

5. 중복 탭 감지/제거
   - dedup.ts 유틸
   - DuplicateDetector 컴포넌트

6. 테스트
   - domain.ts 단위 테스트
   - dedup.ts 단위 테스트
   - profileStore 단위 테스트
```

### Phase 2: 에디터 + 고급 기능 (2~3주)

```
1. 에디터 페이지
   - 3단 레이아웃 (Sidebar + EditorArea + PropertyPanel)
   - Toolbar (저장, Undo/Redo)

2. 드래그앤드롭
   - dnd-kit 설정
   - 그룹 내 탭 순서 변경
   - 그룹 간 탭 이동
   - 그룹 순서 변경

3. 서브도메인 설정
   - split, custom 모드 구현
   - 커스텀 도메인 규칙 UI

4. 검색/필터
   - 프로필 검색
   - 탭 URL/제목 검색
```

### Phase 3: 확장 기능 (2~3주)

```
1. 내보내기/가져오기 (JSON)
2. 키보드 단축키
3. 자동 그룹화 규칙
4. 서버 동기화 (API 설계)
```

---

## 10. UI/UX 가이드라인

### Side Panel (너비 ~400px)

- 깔끔한 카드 기반 UI
- 액션 버튼은 아이콘 + 텍스트 조합
- 프로필 목록은 아코디언 패턴 (클릭으로 펼치기/접기)
- 다이얼로그는 Side Panel 내부 오버레이 모달
- 로딩 상태 표시 (스피너 또는 스켈레톤)
- 성공/실패 토스트 메시지

### 에디터 (전체 화면)

- 좌측 사이드바: 200~250px 고정
- 우측 속성 패널: 250~300px 고정
- 중앙 편집 영역: 나머지 (flex-1)
- 드래그 중 시각적 피드백 (드래그 대상 하이라이트, 드롭 가능 영역 표시)
- 변경사항 있을 때 저장 버튼 활성화 + 탭 제목에 "*" 표시

### 공통

- 색상 테마: Chrome 확장 프로그램 기본 스타일과 조화
- 다크모드: `prefers-color-scheme` 미디어 쿼리 대응
- favicon 표시: `<img src={tab.favIconUrl} />` 로딩 실패 시 기본 아이콘
- 반응형 불필요 (Side Panel과 탭 페이지는 고정 크기)

---

## 11. 에러 핸들링

| 상황 | 처리 방식 |
|------|----------|
| Chrome API 호출 실패 | try-catch + 토스트 에러 메시지 |
| 이미 닫힌 탭 조작 시도 | 무시 (graceful skip) |
| 스토리지 용량 초과 | 경고 메시지 + 오래된 프로필 삭제 안내 |
| 시크릿 탭 이동 시도 | 안내 메시지 표시 (API 제한) |
| 프로필 데이터 손상 | 기본값으로 복구 + 경고 |
| URL 파싱 실패 | "기타" 그룹으로 분류 |

---

## 12. 향후 확장 고려사항 (현재 구현 불필요)

- 서버 동기화: REST API 서버 구축 → 로그인 기반 프로필 동기화
- 세션 자동 저장: 주기적 자동 백업 (크래시 복구)
- 탭 사용 통계: 도메인별 방문 빈도, 탭 수명 분석
- AI 기반 그룹 추천: 탭 제목/URL 분석으로 자동 그룹 제안
- 다국어 지원: i18n (한국어, 영어)
- 프로필 공유: 링크로 프로필 공유 기능
