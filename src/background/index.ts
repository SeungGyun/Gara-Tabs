import type { Settings, Profile, LoadProfileOption, ChromeTabGroupColor, ProfileItem } from '../shared/types';
import { STORAGE_KEYS, DEFAULT_SETTINGS, TAB_GROUP_COLORS, migrateProfile } from '../shared/types';
import { extractDomain, isExcludedUrl, domainToDisplayName } from '../shared/utils/domain';
import { normalizeUrl } from '../shared/utils/dedup';
import { EXISTING_TABS_GROUP_NAME } from '../shared/constants';

// ===== Side Panel 열기 =====
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ===== 메시지 핸들러 =====
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'COLLECT_TABS':
      collectAllTabs().then(sendResponse);
      return true;

    case 'GROUP_BY_DOMAIN':
      groupTabsByDomain(message.settings).then(sendResponse);
      return true;

    case 'LOAD_PROFILE':
      loadProfile(message.profileId, message.option).then(sendResponse);
      return true;

    case 'REMOVE_DUPLICATES':
      removeDuplicateTabs(message.keepTabIds).then(sendResponse);
      return true;

    case 'OPEN_EDITOR':
      openEditor(message.profileId);
      sendResponse({ success: true });
      break;

    case 'GET_CURRENT_TABS':
      getCurrentTabs().then(sendResponse);
      return true;

    case 'SAVE_PROFILE':
      saveCurrentAsProfile(message.name).then(sendResponse);
      return true;

    case 'CLOSE_COLLAPSED_GROUPS':
      closeCollapsedGroups().then(sendResponse);
      return true;

    case 'MOVE_TAB':
      moveTab(message.tabId, message.targetIndex, message.targetGroupId).then(sendResponse);
      return true;

    case 'MOVE_GROUP':
      moveGroup(message.groupId, message.targetIndex).then(sendResponse);
      return true;

    case 'TOGGLE_GROUP_COLLAPSED':
      toggleGroupCollapsed(message.groupId, message.collapsed).then(sendResponse);
      return true;
  }
});

// ===== 탭 모으기 =====
async function collectAllTabs(): Promise<{ success: boolean; moved: number; incognito: number }> {
  try {
    const settings = await getSettings();
    const currentWindow = await chrome.windows.getCurrent();
    const allWindows = await chrome.windows.getAll({ populate: true });

    let moved = 0;
    let incognito = 0;
    const emptyWindowIds: number[] = [];

    for (const win of allWindows) {
      if (win.id === currentWindow.id || !win.tabs) continue;

      if (win.incognito) {
        incognito += win.tabs.length;
        continue;
      }

      for (const tab of win.tabs) {
        if (!tab.id) continue;

        // 고정 탭, 제외 패턴 스킵
        if (tab.pinned) continue;
        if (tab.url && isExcludedUrl(tab.url, settings.excludePatterns)) continue;

        try {
          await chrome.tabs.move(tab.id, { windowId: currentWindow.id!, index: -1 });
          moved++;
        } catch {
          // 이미 닫힌 탭 등 무시
        }
      }

      // 이동 후 빈 창이면 닫기 대상
      if (win.id) emptyWindowIds.push(win.id);
    }

    // 빈 창 닫기 시도
    for (const id of emptyWindowIds) {
      try {
        const w = await chrome.windows.get(id, { populate: true });
        if (w.tabs && w.tabs.length === 0) {
          await chrome.windows.remove(id);
        }
      } catch {
        // 이미 닫힌 창 무시
      }
    }

    // 모으기 후 도메인별 그룹화 자동 실행
    await groupTabsByDomain(settings);

    return { success: true, moved, incognito };
  } catch {
    return { success: false, moved: 0, incognito: 0 };
  }
}

// ===== 도메인별 그룹화 =====
async function groupTabsByDomain(
  settings?: Settings,
): Promise<{ success: boolean; groupCount: number }> {
  try {
    if (!settings) settings = await getSettings();
    const currentWindow = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });

    // 도메인별 분류
    const domainMap = new Map<string, chrome.tabs.Tab[]>();

    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue;
      if (tab.pinned) continue;
      if (isExcludedUrl(tab.url, settings.excludePatterns)) continue;

      // 이미 그룹에 속해 있으면 스킵
      if (tab.groupId !== undefined && tab.groupId !== -1) continue;

      const domain = extractDomain(tab.url, settings.subdomainMode, settings.customDomainRules);
      if (!domain) continue;

      const list = domainMap.get(domain) ?? [];
      list.push(tab);
      domainMap.set(domain, list);
    }

    let colorIndex = 0;
    let groupCount = 0;

    for (const [domain, domainTabs] of domainMap) {
      // 탭이 1개뿐인 도메인은 그룹화하지 않음
      if (domainTabs.length < 2) continue;

      const tabIds = domainTabs.map((t) => t.id!);

      try {
        const groupId = await chrome.tabs.group({
          tabIds,
          createProperties: { windowId: currentWindow.id },
        });
        const color = TAB_GROUP_COLORS[colorIndex % TAB_GROUP_COLORS.length] as chrome.tabGroups.ColorEnum;
        await chrome.tabGroups.update(groupId, {
          title: domainToDisplayName(domain),
          color,
        });
        colorIndex++;
        groupCount++;
      } catch {
        // 그룹화 실패 시 스킵
      }
    }

    return { success: true, groupCount };
  } catch {
    return { success: false, groupCount: 0 };
  }
}

// ===== 프로필 불러오기 =====
async function loadProfile(
  profileId: string,
  option: LoadProfileOption,
): Promise<{ success: boolean }> {
  if (option === 'cancel') return { success: false };

  try {
    const profiles = await getProfiles();
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return { success: false };

    const currentWindow = await chrome.windows.getCurrent();
    const existingTabs = await chrome.tabs.query({ windowId: currentWindow.id });

    if (option === 'close_existing') {
      // 프로필 탭 먼저 생성
      await createProfileTabs(profile, currentWindow.id!);
      // 기존 탭 닫기
      const idsToClose = existingTabs.map((t) => t.id!).filter(Boolean);
      if (idsToClose.length) await chrome.tabs.remove(idsToClose);
    } else if (option === 'keep_as_group') {
      // 기존 탭을 하나의 그룹으로 묶기
      const existingIds = existingTabs
        .filter((t) => !t.pinned && t.id)
        .map((t) => t.id!);

      if (existingIds.length > 0) {
        const gid = await chrome.tabs.group({
          tabIds: existingIds,
          createProperties: { windowId: currentWindow.id },
        });
        await chrome.tabGroups.update(gid, {
          title: EXISTING_TABS_GROUP_NAME,
          color: 'grey',
          collapsed: true,
        });
      }

      // 프로필 탭 전부 열기 (중복 무시)
      await createProfileTabs(profile, currentWindow.id!);
    }

    return { success: true };
  } catch {
    return { success: false };
  }
}

async function createProfileTabs(
  profile: Profile,
  windowId: number,
  skipUrls?: Set<string>,
) {
  for (const item of profile.items) {
    if (item.kind === 'tab') {
      // 독립 탭 생성 (고정 탭 포함)
      const tab = item.tab;
      if (!tab.url || tab.url === '') continue;
      if (skipUrls && skipUrls.has(normalizeUrl(tab.url))) continue;
      try {
        await chrome.tabs.create({
          url: tab.url,
          windowId,
          active: false,
          pinned: tab.pinned,
        });
      } catch {
        // URL 열기 실패 시 스킵
      }
    } else {
      // 그룹 탭 생성
      const group = item.group;
      const createdTabIds: number[] = [];

      for (const tab of group.tabs) {
        if (!tab.url || tab.url === '') continue;
        if (skipUrls && skipUrls.has(normalizeUrl(tab.url))) continue;

        try {
          const newTab = await chrome.tabs.create({
            url: tab.url,
            windowId,
            active: false,
            pinned: tab.pinned,
          });
          if (newTab.id) createdTabIds.push(newTab.id);
        } catch {
          // URL 열기 실패 시 스킵
        }
      }

      // 그룹 묶기
      if (createdTabIds.length > 0) {
        try {
          const gid = await chrome.tabs.group({
            tabIds: createdTabIds,
            createProperties: { windowId },
          });
          await chrome.tabGroups.update(gid, {
            title: group.name,
            color: group.color as chrome.tabGroups.ColorEnum,
          });
        } catch {
          // 그룹화 실패 스킵
        }
      }
    }
  }
}

// ===== 중복 탭 제거 =====
async function removeDuplicateTabs(
  keepTabIds: number[],
): Promise<{ success: boolean; removed: number }> {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });

    // 정규화된 URL로 중복 찾기
    const urlMap = new Map<string, chrome.tabs.Tab[]>();
    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue;
      const key = normalizeUrl(tab.url);
      const list = urlMap.get(key) ?? [];
      list.push(tab);
      urlMap.set(key, list);
    }

    const keepSet = new Set(keepTabIds);
    const toRemove: number[] = [];

    for (const [, dupTabs] of urlMap) {
      if (dupTabs.length < 2) continue;
      for (const tab of dupTabs) {
        if (tab.id && !keepSet.has(tab.id)) {
          toRemove.push(tab.id);
        }
      }
    }

    if (toRemove.length > 0) {
      await chrome.tabs.remove(toRemove);
    }

    return { success: true, removed: toRemove.length };
  } catch {
    return { success: false, removed: 0 };
  }
}

// ===== 현재 탭 정보 =====
async function getCurrentTabs() {
  const currentWindow = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
  const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });
  return { tabs, groups };
}

// ===== 현재 탭을 프로필로 저장 =====
async function saveCurrentAsProfile(name: string) {
  try {
    const { tabs, groups } = await getCurrentTabs();
    const groupMap = new Map<number, chrome.tabGroups.TabGroup>();
    for (const g of groups) groupMap.set(g.id, g);

    const sorted = [...tabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const items: ProfileItem[] = [];
    let currentGroupId: number | null = null;
    let currentGroupTabs: { id: string; url: string; title: string; favIconUrl: string | null; pinned: boolean }[] = [];
    let colorIndex = 0;

    const flushGroup = () => {
      if (currentGroupId !== null && currentGroupTabs.length > 0) {
        const chromeGroup = groupMap.get(currentGroupId);
        items.push({
          kind: 'group',
          group: {
            id: crypto.randomUUID(),
            name: chromeGroup?.title || '그룹',
            color: (chromeGroup?.color ?? TAB_GROUP_COLORS[colorIndex++]) as ChromeTabGroupColor,
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
      const profileTab = {
        id: crypto.randomUUID(),
        url: tab.url ?? '',
        title: tab.title ?? '',
        favIconUrl: tab.favIconUrl ?? null,
        pinned: tab.pinned ?? false,
      };

      if (gid !== -1 && groupMap.has(gid)) {
        if (gid === currentGroupId) {
          currentGroupTabs.push(profileTab);
        } else {
          flushGroup();
          currentGroupId = gid;
          currentGroupTabs = [profileTab];
        }
      } else {
        flushGroup();
        items.push({ kind: 'tab', tab: profileTab });
      }
    }
    flushGroup();

    const profile: Profile = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      items,
    };

    const existing = await getProfiles();
    const idx = existing.findIndex((p) => p.name === name);
    if (idx >= 0) {
      existing[idx] = profile;
    } else {
      existing.push(profile);
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: existing });

    return { success: true, profile };
  } catch {
    return { success: false };
  }
}

// ===== 비활성(접힌) 그룹 닫기 =====
async function closeCollapsedGroups(): Promise<{ success: boolean; closed: number; tabsClosed: number }> {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const groups = await chrome.tabGroups.query({ windowId: currentWindow.id });
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });

    const collapsedGroupIds = new Set(
      groups.filter((g) => g.collapsed).map((g) => g.id),
    );

    if (collapsedGroupIds.size === 0) {
      return { success: true, closed: 0, tabsClosed: 0 };
    }

    const tabIdsToClose = tabs
      .filter((t) => t.groupId !== undefined && collapsedGroupIds.has(t.groupId) && t.id)
      .map((t) => t.id!);

    if (tabIdsToClose.length > 0) {
      await chrome.tabs.remove(tabIdsToClose);
    }

    return { success: true, closed: collapsedGroupIds.size, tabsClosed: tabIdsToClose.length };
  } catch {
    return { success: false, closed: 0, tabsClosed: 0 };
  }
}

// ===== 탭/그룹 이동 =====
async function moveTab(tabId: number, targetIndex: number, targetGroupId?: number): Promise<{ success: boolean }> {
  try {
    const tab = await chrome.tabs.get(tabId);
    // chrome.tabs.move는 "제거 후 삽입" 방식이라
    // 소스가 타겟보다 앞에 있으면 제거 시 인덱스가 1 당겨짐
    const adjustedIndex = tab.index !== undefined && tab.index < targetIndex
      ? targetIndex - 1
      : targetIndex;
    await chrome.tabs.move(tabId, { index: adjustedIndex });
    if (targetGroupId !== undefined && targetGroupId !== -1) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: targetGroupId });
    } else if (targetGroupId === -1) {
      await chrome.tabs.ungroup(tabId);
    }
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function moveGroup(groupId: number, targetIndex: number): Promise<{ success: boolean }> {
  try {
    await chrome.tabGroups.move(groupId, { index: targetIndex });
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function toggleGroupCollapsed(groupId: number, collapsed: boolean): Promise<{ success: boolean }> {
  try {
    await chrome.tabGroups.update(groupId, { collapsed });
    return { success: true };
  } catch {
    return { success: false };
  }
}

// ===== 에디터 열기 =====
function openEditor(profileId?: string) {
  const url = chrome.runtime.getURL('src/editor/index.html');
  const fullUrl = profileId ? `${url}?profileId=${profileId}` : url;
  chrome.tabs.create({ url: fullUrl });
}

// ===== 자동 그룹화: 탭 생성/업데이트 시 규칙 적용 =====
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // URL이 완전히 로드된 후에만 실행
  if (changeInfo.status !== 'complete' || !tab.url) return;

  try {
    const settings = await getSettings();
    if (!settings.autoGroupEnabled || settings.autoGroupRules.length === 0) return;
    if (tab.pinned) return;
    if (isExcludedUrl(tab.url, settings.excludePatterns)) return;
    // 이미 그룹에 속해 있으면 스킵
    if (tab.groupId !== undefined && tab.groupId !== -1) return;

    const matchedRule = settings.autoGroupRules.find(
      (rule) => rule.enabled && tab.url!.toLowerCase().includes(rule.pattern.toLowerCase()),
    );
    if (!matchedRule) return;

    // 같은 이름의 기존 그룹이 있으면 거기에 추가, 없으면 새 그룹 생성
    const windowId = tab.windowId;
    const existingGroups = await chrome.tabGroups.query({ windowId });
    const existing = existingGroups.find((g) => g.title === matchedRule.groupName);

    if (existing) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: existing.id });
    } else {
      const groupId = await chrome.tabs.group({
        tabIds: [tabId],
        createProperties: { windowId },
      });
      await chrome.tabGroups.update(groupId, {
        title: matchedRule.groupName,
        color: matchedRule.color as chrome.tabGroups.ColorEnum,
      });
    }
  } catch {
    // 자동 그룹화 실패 시 무시
  }
});

// ===== 유틸 =====
async function getSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...data[STORAGE_KEYS.SETTINGS] };
}

async function getProfiles(): Promise<Profile[]> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PROFILES);
  const raw = data[STORAGE_KEYS.PROFILES] ?? [];
  return raw.map(migrateProfile);
}
