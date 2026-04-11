import { useState, useMemo } from 'react';
import { useChromeTabs } from '../../shared/hooks/useChromeTabs';
import { useTabGroups } from '../../shared/hooks/useTabGroups';
import { useProfileStore } from '../../shared/store/profileStore';
import { COLOR_MAP_LIGHT, COLOR_MAP } from '../../shared/utils/colors';
import { normalizeUrl } from '../../shared/utils/dedup';
import type { ChromeTabGroupColor } from '../../shared/types';

export default function CurrentTabsView() {
  const { tabs, isLoading } = useChromeTabs();
  const { groups } = useTabGroups();
  const profiles = useProfileStore((s) => s.profiles);

  // URL → 프로필 커스텀 이름 매핑 (최신 프로필 우선)
  const profileTitleMap = useMemo(() => {
    const map = new Map<string, { title: string; profileName: string }>();
    const sorted = [...profiles].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const profile of sorted) {
      for (const group of profile.groups) {
        for (const tab of group.tabs) {
          if (!tab.url) continue;
          const key = normalizeUrl(tab.url);
          if (!map.has(key) && tab.title) {
            map.set(key, { title: tab.title, profileName: profile.name });
          }
        }
      }
    }
    return map;
  }, [profiles]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400">
        로딩 중...
      </div>
    );
  }

  // 그룹 맵
  const groupMap = new Map<number, chrome.tabGroups.TabGroup>();
  for (const g of groups) groupMap.set(g.id, g);

  // 탭을 그룹별로 분류
  const grouped = new Map<number, chrome.tabs.Tab[]>();
  const ungrouped: chrome.tabs.Tab[] = [];
  const pinnedTabs: chrome.tabs.Tab[] = [];

  for (const tab of tabs) {
    if (tab.pinned) {
      pinnedTabs.push(tab);
    } else if (tab.groupId && tab.groupId !== -1) {
      const list = grouped.get(tab.groupId) ?? [];
      list.push(tab);
      grouped.set(tab.groupId, list);
    } else {
      ungrouped.push(tab);
    }
  }

  const handleTabClick = (tabId: number) => {
    chrome.tabs.update(tabId, { active: true });
  };

  const handleTabClose = (tabId: number) => {
    chrome.tabs.remove(tabId);
  };

  return (
    <div className="p-2 space-y-1">
      <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
        {tabs.length}개 탭
      </div>

      {/* 고정 탭 */}
      {pinnedTabs.length > 0 && (
        <GroupSection title="📌 고정 탭" color="grey" defaultOpen={false}>
          {pinnedTabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              profileTitleMap={profileTitleMap}
              onClick={() => tab.id && handleTabClick(tab.id)}
              onClose={() => tab.id && handleTabClose(tab.id)}
            />
          ))}
        </GroupSection>
      )}

      {/* 그룹화된 탭 */}
      {[...grouped.entries()].map(([groupId, groupTabs]) => {
        const group = groupMap.get(groupId);
        return (
          <GroupSection
            key={groupId}
            title={group?.title || '그룹'}
            color={(group?.color as ChromeTabGroupColor) ?? 'grey'}
            tabCount={groupTabs.length}
          >
            {groupTabs.map((tab) => (
              <TabItem
                key={tab.id}
                tab={tab}
                profileTitleMap={profileTitleMap}
                onClick={() => tab.id && handleTabClick(tab.id)}
                onClose={() => tab.id && handleTabClose(tab.id)}
              />
            ))}
          </GroupSection>
        );
      })}

      {/* 미분류 탭 */}
      {ungrouped.length > 0 && (
        <GroupSection title="미분류" color="grey">
          {ungrouped.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              profileTitleMap={profileTitleMap}
              onClick={() => tab.id && handleTabClick(tab.id)}
              onClose={() => tab.id && handleTabClose(tab.id)}
            />
          ))}
        </GroupSection>
      )}
    </div>
  );
}

// ── 서브 컴포넌트 ──

function GroupSection({
  title,
  color,
  tabCount,
  defaultOpen = true,
  children,
}: {
  title: string;
  color: ChromeTabGroupColor;
  tabCount?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bgColor = COLOR_MAP_LIGHT[color] ?? COLOR_MAP_LIGHT.grey;
  const dotColor = COLOR_MAP[color] ?? COLOR_MAP.grey;

  return (
    <div className="rounded-md overflow-hidden" style={{ backgroundColor: bgColor + '40' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-left hover:opacity-80"
      >
        <span className="text-xs">{open ? '▼' : '▶'}</span>
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <span className="truncate flex-1">{title}</span>
        {tabCount !== undefined && (
          <span className="text-xs text-gray-500">{tabCount}</span>
        )}
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

function TabItem({
  tab,
  profileTitleMap,
  onClick,
  onClose,
}: {
  tab: chrome.tabs.Tab;
  profileTitleMap: Map<string, { title: string; profileName: string }>;
  onClick: () => void;
  onClose: () => void;
}) {
  // 프로필 커스텀 이름 매칭
  const profileMatch = tab.url ? profileTitleMap.get(normalizeUrl(tab.url)) : undefined;
  const displayTitle = profileMatch?.title ?? tab.title ?? tab.url;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 mx-1 rounded hover:bg-white/60 dark:hover:bg-gray-700/40 cursor-pointer group"
      onClick={onClick}
    >
      <FavIcon url={tab.favIconUrl} />
      <span className="text-xs truncate flex-1" title={profileMatch ? `프로필 "${profileMatch.profileName}"의 커스텀 이름\n원본: ${tab.title}` : tab.title}>
        {displayTitle}
      </span>
      {profileMatch && profileMatch.title !== tab.title && (
        <span className="text-[10px] text-blue-500 flex-shrink-0" title={`프로필: ${profileMatch.profileName}`}>
          P
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs px-1"
      >
        ×
      </button>
    </div>
  );
}

function FavIcon({ url }: { url?: string | null }) {
  if (!url) {
    return <span className="w-4 h-4 rounded bg-gray-300 dark:bg-gray-600 flex-shrink-0" />;
  }
  return (
    <img
      src={url}
      alt=""
      className="w-4 h-4 flex-shrink-0"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}
