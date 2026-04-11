import { useState, useMemo, useCallback, useRef } from 'react';
import { useChromeTabs } from '../../shared/hooks/useChromeTabs';
import { useTabGroups } from '../../shared/hooks/useTabGroups';
import { useProfileStore } from '../../shared/store/profileStore';
import { COLOR_MAP_LIGHT, COLOR_MAP } from '../../shared/utils/colors';
import { normalizeUrl } from '../../shared/utils/dedup';
import type { ChromeTabGroupColor } from '../../shared/types';

type DragItem =
  | { kind: 'tab'; tabId: number; groupId: number; index: number }
  | { kind: 'group'; groupId: number; firstIndex: number };

// 드롭 위치: 'before' = 위쪽 삽입선, 'after' = 아래쪽 삽입선
type DropPosition = { id: string; pos: 'before' | 'after' } | null;

export default function CurrentTabsView() {
  const { tabs, isLoading, refresh } = useChromeTabs();
  const { groups } = useTabGroups();
  const profiles = useProfileStore((s) => s.profiles);

  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>(null);

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

  const handleMoveTab = useCallback(async (tabId: number, targetIndex: number, targetGroupId?: number) => {
    await chrome.runtime.sendMessage({ type: 'MOVE_TAB', tabId, targetIndex, targetGroupId });
    refresh();
  }, [refresh]);

  const handleMoveGroup = useCallback(async (groupId: number, targetIndex: number) => {
    await chrome.runtime.sendMessage({ type: 'MOVE_GROUP', groupId, targetIndex });
    refresh();
  }, [refresh]);

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

  // 그룹 순서 (index 기준)
  const groupEntries = [...grouped.entries()].sort((a, b) => {
    const ai = a[1][0]?.index ?? 0;
    const bi = b[1][0]?.index ?? 0;
    return ai - bi;
  });

  const handleTabClick = (tabId: number) => {
    chrome.tabs.update(tabId, { active: true });
  };

  const handleTabClose = (tabId: number) => {
    chrome.tabs.remove(tabId);
  };

  const clearDrag = () => { setDragItem(null); setDropPosition(null); };

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
      {groupEntries.map(([groupId, groupTabs]) => {
        const group = groupMap.get(groupId);
        return (
          <GroupSection
            key={groupId}
            title={group?.title || '그룹'}
            color={(group?.color as ChromeTabGroupColor) ?? 'grey'}
            tabCount={groupTabs.length}
            groupId={groupId}
            dragItem={dragItem}
            dropPosition={dropPosition}
            onDragStart={() => setDragItem({ kind: 'group', groupId, firstIndex: groupTabs[0]?.index ?? 0 })}
            onDragEnd={clearDrag}
            onDropGroup={(fromGroupId, pos) => {
              const targetIdx = pos === 'before'
                ? (groupTabs[0]?.index ?? 0)
                : (groupTabs[groupTabs.length - 1]?.index ?? 0) + 1;
              handleMoveGroup(fromGroupId, targetIdx);
            }}
            onDropPositionChange={setDropPosition}
          >
            {groupTabs.map((tab, i) => (
              <TabItem
                key={tab.id}
                tab={tab}
                profileTitleMap={profileTitleMap}
                onClick={() => tab.id && handleTabClick(tab.id)}
                onClose={() => tab.id && handleTabClose(tab.id)}
                draggable
                dragItem={dragItem}
                dropPosition={dropPosition}
                onDragStart={() => setDragItem({ kind: 'tab', tabId: tab.id!, groupId, index: tab.index! })}
                onDragEnd={clearDrag}
                onDrop={(fromTabId, pos) => {
                  const targetIdx = pos === 'after' ? (tab.index ?? i) + 1 : (tab.index ?? i);
                  handleMoveTab(fromTabId, targetIdx, groupId);
                }}
                onDropPositionChange={setDropPosition}
              />
            ))}
          </GroupSection>
        );
      })}

      {/* 미분류 탭 */}
      {ungrouped.length > 0 && (
        <GroupSection
          title="미분류"
          color="grey"
          groupId={-1}
          dragItem={dragItem}
          dropPosition={dropPosition}
          onDropGroup={(fromGroupId, pos) => {
            const targetIdx = pos === 'before'
              ? (ungrouped[0]?.index ?? tabs.length)
              : (ungrouped[ungrouped.length - 1]?.index ?? tabs.length) + 1;
            handleMoveGroup(fromGroupId, targetIdx);
          }}
          onDropPositionChange={setDropPosition}
        >
          {ungrouped.map((tab, i) => (
            <TabItem
              key={tab.id}
              tab={tab}
              profileTitleMap={profileTitleMap}
              onClick={() => tab.id && handleTabClick(tab.id)}
              onClose={() => tab.id && handleTabClose(tab.id)}
              draggable
              dragItem={dragItem}
              dropPosition={dropPosition}
              onDragStart={() => setDragItem({ kind: 'tab', tabId: tab.id!, groupId: -1, index: tab.index! })}
              onDragEnd={clearDrag}
              onDrop={(fromTabId, pos) => {
                const targetIdx = pos === 'after' ? (tab.index ?? i) + 1 : (tab.index ?? i);
                handleMoveTab(fromTabId, targetIdx, -1);
              }}
              onDropPositionChange={setDropPosition}
            />
          ))}
        </GroupSection>
      )}
    </div>
  );
}

// ── 삽입선 컴포넌트 ──

function InsertionLine() {
  return (
    <div className="relative h-0 mx-1">
      <div className="absolute inset-x-0 -top-px h-0.5 bg-blue-500 rounded-full" />
      <div className="absolute -left-0.5 -top-[3px] w-1.5 h-1.5 bg-blue-500 rounded-full" />
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
  groupId,
  dragItem,
  dropPosition,
  onDragStart,
  onDragEnd,
  onDropGroup,
  onDropPositionChange,
}: {
  title: string;
  color: ChromeTabGroupColor;
  tabCount?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  groupId?: number;
  dragItem?: DragItem | null;
  dropPosition?: DropPosition;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDropGroup?: (fromGroupId: number, pos: 'before' | 'after') => void;
  onDropPositionChange?: (dp: DropPosition) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const bgColor = COLOR_MAP_LIGHT[color] ?? COLOR_MAP_LIGHT.grey;
  const dotColor = COLOR_MAP[color] ?? COLOR_MAP.grey;

  const isDraggableGroup = groupId !== undefined && groupId !== -1 && onDragStart;
  const dropId = `group-${groupId}`;
  const showBefore = dropPosition?.id === dropId && dropPosition.pos === 'before' && dragItem?.kind === 'group';
  const showAfter = dropPosition?.id === dropId && dropPosition.pos === 'after' && dragItem?.kind === 'group';

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragItem || dragItem.kind !== 'group') return;
    if (dragItem.groupId === groupId) return;
    e.preventDefault();
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const pos = y < rect.height / 2 ? 'before' : 'after';
    onDropPositionChange?.({ id: dropId, pos });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem || dragItem.kind !== 'group' || !dropPosition) return;
    onDropGroup?.(dragItem.groupId, dropPosition.pos);
    onDropPositionChange?.(null);
  };

  return (
    <div ref={ref}>
      {showBefore && <InsertionLine />}
      <div
        className="rounded-md overflow-hidden"
        style={{ backgroundColor: bgColor + '40' }}
        onDragOver={handleDragOver}
        onDragLeave={() => onDropPositionChange?.(null)}
        onDrop={handleDrop}
      >
        <button
          draggable={!!isDraggableGroup}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            onDragStart?.();
          }}
          onDragEnd={onDragEnd}
          onClick={() => setOpen(!open)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-left hover:opacity-80 ${isDraggableGroup ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
      {showAfter && <InsertionLine />}
    </div>
  );
}

function TabItem({
  tab,
  profileTitleMap,
  onClick,
  onClose,
  draggable: isDraggable,
  dragItem,
  dropPosition,
  onDragStart,
  onDragEnd,
  onDrop,
  onDropPositionChange,
}: {
  tab: chrome.tabs.Tab;
  profileTitleMap: Map<string, { title: string; profileName: string }>;
  onClick: () => void;
  onClose: () => void;
  draggable?: boolean;
  dragItem?: DragItem | null;
  dropPosition?: DropPosition;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDrop?: (fromTabId: number, pos: 'before' | 'after') => void;
  onDropPositionChange?: (dp: DropPosition) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dropId = `tab-${tab.id}`;
  const showBefore = dropPosition?.id === dropId && dropPosition.pos === 'before' && dragItem?.kind === 'tab';
  const showAfter = dropPosition?.id === dropId && dropPosition.pos === 'after' && dragItem?.kind === 'tab';
  const isDragging = dragItem?.kind === 'tab' && dragItem.tabId === tab.id;

  // 프로필 커스텀 이름 매칭
  const profileMatch = tab.url ? profileTitleMap.get(normalizeUrl(tab.url)) : undefined;
  const displayTitle = profileMatch?.title ?? tab.title ?? tab.url;

  const handleDragOver = (e: React.DragEvent) => {
    if (!dragItem || dragItem.kind !== 'tab') return;
    if (dragItem.tabId === tab.id) return;
    e.preventDefault();
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const pos = y < rect.height / 2 ? 'before' : 'after';
    onDropPositionChange?.({ id: dropId, pos });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem || dragItem.kind !== 'tab' || !dropPosition) return;
    onDrop?.(dragItem.tabId, dropPosition.pos);
    onDropPositionChange?.(null);
  };

  return (
    <div ref={ref}>
      {showBefore && <InsertionLine />}
      <div
        draggable={isDraggable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart?.();
        }}
        onDragEnd={onDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={() => onDropPositionChange?.(null)}
        onDrop={handleDrop}
        className={`flex items-center gap-2 px-3 py-1 mx-1 rounded cursor-pointer group
          ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}
          ${isDragging ? 'opacity-30' : ''}
          hover:bg-white/60 dark:hover:bg-gray-700/40`}
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
      {showAfter && <InsertionLine />}
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
