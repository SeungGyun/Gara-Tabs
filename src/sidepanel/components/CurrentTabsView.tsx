import { useState, useMemo, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useChromeTabs } from '../../shared/hooks/useChromeTabs';
import { useTabGroups } from '../../shared/hooks/useTabGroups';
import { useProfileStore } from '../../shared/store/profileStore';
import { COLOR_MAP_LIGHT, COLOR_MAP } from '../../shared/utils/colors';
import { normalizeUrl } from '../../shared/utils/dedup';
import {
  buildSegments as buildSegmentsPure,
  computeTabToGroupTarget,
  type SimpleTab,
} from '../../shared/utils/tabDragLogic';
import type { ChromeTabGroupColor } from '../../shared/types';

// ── 메인 컴포넌트 ──

export default function CurrentTabsView() {
  const { tabs, isLoading, refresh } = useChromeTabs();
  const { groups } = useTabGroups();
  const profiles = useProfileStore((s) => s.profiles);

  // DnD 상태
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropIntoGroupId, _setDropIntoGroupId] = useState<number | null>(null);
  const dropIntoRef = useRef<number | null>(null);
  const setDropIntoGroupId = useCallback((id: number | null) => {
    dropIntoRef.current = id;
    _setDropIntoGroupId(id);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const profileTitleMap = useMemo(() => {
    const map = new Map<string, { title: string; profileName: string }>();
    const sorted = [...profiles].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const profile of sorted) {
      for (const item of profile.items) {
        const tabs = item.kind === 'group' ? item.group.tabs : [item.tab];
        for (const tab of tabs) {
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

  const groupMap = useMemo(() => {
    const m = new Map<number, chrome.tabGroups.TabGroup>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groups]);

  const segments = useMemo(() => {
    const simpleTabs: SimpleTab[] = tabs.map((t) => ({
      id: t.id ?? 0,
      index: t.index ?? 0,
      groupId: t.groupId ?? -1,
      pinned: t.pinned ?? false,
    }));
    const groupIds = new Set(groups.map((g) => g.id));
    return buildSegmentsPure(simpleTabs, groupIds);
  }, [tabs, groups]);

  // tabId → { index, groupId }
  const tabLookup = useMemo(() => {
    const map = new Map<number, { index: number; groupId: number }>();
    for (const tab of tabs) {
      if (tab.id != null) {
        map.set(tab.id, { index: tab.index ?? 0, groupId: tab.groupId ?? -1 });
      }
    }
    return map;
  }, [tabs]);

  // 최상위 정렬 ID (그룹 + 미분류 탭, 고정 탭 제외)
  const topLevelIds = useMemo(() => {
    return segments
      .filter((s) => s.kind !== 'pinned')
      .map((s) => (s.kind === 'group' ? `g-${s.groupId}` : `t-${s.tab.id}`));
  }, [segments]);

  const handleMoveTab = useCallback(
    async (tabId: number, targetIndex: number, targetGroupId?: number) => {
      await chrome.runtime.sendMessage({ type: 'MOVE_TAB', tabId, targetIndex, targetGroupId });
      refresh();
    },
    [refresh],
  );

  const handleMoveGroup = useCallback(
    async (groupId: number, targetIndex: number) => {
      await chrome.runtime.sendMessage({ type: 'MOVE_GROUP', groupId, targetIndex });
      refresh();
    },
    [refresh],
  );

  const handleToggleCollapsed = useCallback(async (groupId: number, collapsed: boolean) => {
    await chrome.runtime.sendMessage({ type: 'TOGGLE_GROUP_COLLAPSED', groupId, collapsed });
  }, []);

  const handleTabClick = useCallback((tabId: number) => {
    chrome.tabs.update(tabId, { active: true });
  }, []);

  const handleTabClose = useCallback((tabId: number) => {
    chrome.tabs.remove(tabId);
  }, []);

  // ── DnD 핸들러 ──

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const activeIdStr = event.active.id as string;
      // 탭 드래그가 아니면 drop-into 무시
      if (!activeIdStr.startsWith('t-')) {
        setDropIntoGroupId(null);
        return;
      }
      const overId = event.over?.id as string | undefined;
      if (overId?.startsWith('g-')) {
        const groupId = parseInt(overId.slice(2));
        const activeTabId = parseInt(activeIdStr.slice(2));
        const tabInfo = tabLookup.get(activeTabId);
        // 같은 그룹 내에서는 drop-into 하지 않음
        if (tabInfo && tabInfo.groupId !== groupId) {
          setDropIntoGroupId(groupId);
          return;
        }
      }
      setDropIntoGroupId(null);
    },
    [tabLookup, setDropIntoGroupId],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const currentDropIntoGroupId = dropIntoRef.current;

      setActiveId(null);
      setDropIntoGroupId(null);

      if (!over || active.id === over.id) return;

      const activeIdStr = active.id as string;
      const overIdStr = over.id as string;
      const isActiveGroup = activeIdStr.startsWith('g-');

      if (!isActiveGroup) {
        // ── 탭 이동 ──
        const activeTabId = parseInt(activeIdStr.slice(2));
        const activeTab = tabLookup.get(activeTabId);
        if (!activeTab) return;

        // Case 1: 그룹 안으로 드롭
        if (currentDropIntoGroupId != null || overIdStr.startsWith('g-')) {
          const targetGroupId = currentDropIntoGroupId ?? parseInt(overIdStr.slice(2));
          const segment = segments.find(
            (s) => s.kind === 'group' && s.groupId === targetGroupId,
          );
          if (segment && segment.kind === 'group') {
            const result = computeTabToGroupTarget(segment.tabs, 'into');
            handleMoveTab(activeTabId, result.targetIndex, result.targetGroupId);
          }
          return;
        }

        // Case 2: 탭 → 탭 이동
        const overTabId = parseInt(overIdStr.slice(2));
        const overTab = tabLookup.get(overTabId);
        if (!overTab) return;

        const targetGroupId = overTab.groupId;
        const pos: 'before' | 'after' = activeTab.index < overTab.index ? 'after' : 'before';
        const targetIndex = pos === 'after' ? overTab.index + 1 : overTab.index;
        handleMoveTab(activeTabId, targetIndex, targetGroupId);
      } else {
        // ── 그룹 이동 ──
        const activeGroupId = parseInt(activeIdStr.slice(2));

        if (overIdStr.startsWith('g-')) {
          // 그룹 → 그룹
          const overGroupId = parseInt(overIdStr.slice(2));
          const overSegment = segments.find(
            (s) => s.kind === 'group' && s.groupId === overGroupId,
          );
          if (!overSegment || overSegment.kind !== 'group') return;
          const activeIdx = topLevelIds.indexOf(activeIdStr);
          const overIdx = topLevelIds.indexOf(overIdStr);
          const targetIdx =
            activeIdx < overIdx
              ? overSegment.tabs[overSegment.tabs.length - 1].index + 1
              : overSegment.tabs[0].index;
          handleMoveGroup(activeGroupId, targetIdx);
        } else {
          // 그룹 → 미분류 탭 위치
          const overTabId = parseInt(overIdStr.slice(2));
          const overTab = tabLookup.get(overTabId);
          if (!overTab) return;
          const activeIdx = topLevelIds.indexOf(activeIdStr);
          const overIdx = topLevelIds.indexOf(overIdStr);
          const targetIdx = activeIdx < overIdx ? overTab.index + 1 : overTab.index;
          handleMoveGroup(activeGroupId, targetIdx);
        }
      }
    },
    [segments, tabLookup, topLevelIds, handleMoveTab, handleMoveGroup, setDropIntoGroupId],
  );

  // ── DragOverlay 데이터 ──

  const activeDragData = useMemo(() => {
    if (!activeId) return null;
    if (activeId.startsWith('g-')) {
      const groupId = parseInt(activeId.slice(2));
      const group = groupMap.get(groupId);
      return group ? { type: 'group' as const, group } : null;
    }
    const tabId = parseInt(activeId.slice(2));
    const tab = tabs.find((t) => t.id === tabId);
    return tab ? { type: 'tab' as const, tab } : null;
  }, [activeId, groupMap, tabs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400">로딩 중...</div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">{tabs.length}개 탭</div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
          {segments.map((segment) => {
            if (segment.kind === 'pinned') {
              const chromeTabs = segment.tabs
                .map((st) => tabs.find((t) => t.id === st.id)!)
                .filter(Boolean);
              return (
                <PinnedSection key="pinned">
                  {chromeTabs.map((tab) => (
                    <StaticTabItem
                      key={tab.id}
                      tab={tab}
                      profileTitleMap={profileTitleMap}
                      onClick={() => tab.id && handleTabClick(tab.id)}
                      onClose={() => tab.id && handleTabClose(tab.id)}
                    />
                  ))}
                </PinnedSection>
              );
            }

            if (segment.kind === 'group') {
              const group = groupMap.get(segment.groupId);
              if (!group) return null;
              const groupTabs = segment.tabs
                .map((st) => tabs.find((t) => t.id === st.id)!)
                .filter(Boolean);
              const tabIds = segment.tabs.map((st) => `t-${st.id}`);

              return (
                <SortableGroupSection
                  key={`group-${group.id}`}
                  groupId={group.id}
                  title={group.title || '그룹'}
                  color={(group.color as ChromeTabGroupColor) ?? 'grey'}
                  tabCount={groupTabs.length}
                  collapsed={group.collapsed}
                  isDropTarget={dropIntoGroupId === group.id}
                  onToggle={() => handleToggleCollapsed(group.id, !group.collapsed)}
                >
                  <SortableContext items={tabIds} strategy={verticalListSortingStrategy}>
                    {groupTabs.map((tab) => (
                      <SortableTabItem
                        key={tab.id}
                        tab={tab}
                        profileTitleMap={profileTitleMap}
                        onClick={() => tab.id && handleTabClick(tab.id)}
                        onClose={() => tab.id && handleTabClose(tab.id)}
                      />
                    ))}
                  </SortableContext>
                </SortableGroupSection>
              );
            }

            // ungrouped
            const chromeTab = tabs.find((t) => t.id === segment.tab.id);
            if (!chromeTab) return null;
            return (
              <SortableStandaloneTab
                key={`standalone-${chromeTab.id}`}
                tab={chromeTab}
                profileTitleMap={profileTitleMap}
                onClick={() => chromeTab.id && handleTabClick(chromeTab.id)}
                onClose={() => chromeTab.id && handleTabClose(chromeTab.id)}
              />
            );
          })}
        </SortableContext>

        <DragOverlay>
          {activeDragData?.type === 'group' && (
            <div className="opacity-80 bg-white dark:bg-gray-800 rounded-md shadow-lg border px-3 py-1.5 text-sm font-medium flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    COLOR_MAP[(activeDragData.group.color as ChromeTabGroupColor) ?? 'grey'],
                }}
              />
              {activeDragData.group.title || '그룹'}
            </div>
          )}
          {activeDragData?.type === 'tab' && (
            <div className="opacity-80 bg-white dark:bg-gray-800 rounded shadow-lg border px-3 py-1.5 text-xs flex items-center gap-2">
              <FavIcon url={activeDragData.tab.favIconUrl} />
              <span className="truncate max-w-[280px]">
                {activeDragData.tab.title ?? activeDragData.tab.url}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── 고정 탭 섹션 (드래그 불가) ──

function PinnedSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div
        className="rounded-md overflow-hidden"
        style={{ backgroundColor: COLOR_MAP_LIGHT.grey + '40' }}
      >
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-left hover:opacity-80"
        >
          <span className="text-xs">{open ? '▼' : '▶'}</span>
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: COLOR_MAP.grey }}
          />
          <span className="truncate flex-1">📌 고정 탭</span>
        </button>
        {open && <div className="pb-1">{children}</div>}
      </div>
    </div>
  );
}

// ── 정렬 가능 그룹 섹션 ──

function SortableGroupSection({
  groupId,
  title,
  color,
  tabCount,
  collapsed,
  isDropTarget,
  onToggle,
  children,
}: {
  groupId: number;
  title: string;
  color: ChromeTabGroupColor;
  tabCount: number;
  collapsed?: boolean;
  isDropTarget: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `g-${groupId}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const open = collapsed !== undefined ? !collapsed : true;
  const bgColor = COLOR_MAP_LIGHT[color] ?? COLOR_MAP_LIGHT.grey;
  const dotColor = COLOR_MAP[color] ?? COLOR_MAP.grey;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`rounded-md overflow-hidden transition-shadow ${isDropTarget ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
        style={{ backgroundColor: bgColor + '40' }}
      >
        <button
          {...attributes}
          {...listeners}
          onClick={onToggle}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-left hover:opacity-80 cursor-grab active:cursor-grabbing"
        >
          <span className="text-xs">{open ? '▼' : '▶'}</span>
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: dotColor }}
          />
          <span className="truncate flex-1">{title}</span>
          <span className="text-xs text-gray-500">{tabCount}</span>
        </button>
        {open && <div className="pb-1">{children}</div>}
      </div>
    </div>
  );
}

// ── 정렬 가능 탭 (그룹 내부용) ──

function SortableTabItem({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `t-${tab.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const profileMatch = tab.url ? profileTitleMap.get(normalizeUrl(tab.url)) : undefined;
  const displayTitle = profileMatch?.title ?? tab.title ?? tab.url;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        {...attributes}
        {...listeners}
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-1 mx-1 rounded cursor-grab active:cursor-grabbing group
          hover:bg-white/60 dark:hover:bg-gray-700/40"
      >
        <FavIcon url={tab.favIconUrl} />
        <span
          className="text-xs truncate flex-1"
          title={
            profileMatch
              ? `프로필 "${profileMatch.profileName}"의 커스텀 이름\n원본: ${tab.title}`
              : tab.title
          }
        >
          {displayTitle}
        </span>
        {profileMatch && profileMatch.title !== tab.title && (
          <span
            className="text-[10px] text-blue-500 flex-shrink-0"
            title={`프로필: ${profileMatch.profileName}`}
          >
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
    </div>
  );
}

// ── 정렬 가능 미분류 탭 ──

function SortableStandaloneTab({
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `t-${tab.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const profileMatch = tab.url ? profileTitleMap.get(normalizeUrl(tab.url)) : undefined;
  const displayTitle = profileMatch?.title ?? tab.title ?? tab.url;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        {...attributes}
        {...listeners}
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-1.5 mx-1 rounded cursor-grab active:cursor-grabbing group
          hover:bg-white/60 dark:hover:bg-gray-700/40"
      >
        <FavIcon url={tab.favIconUrl} />
        <span
          className="text-sm truncate flex-1"
          title={
            profileMatch
              ? `프로필 "${profileMatch.profileName}"의 커스텀 이름\n원본: ${tab.title}`
              : tab.title
          }
        >
          {displayTitle}
        </span>
        {profileMatch && profileMatch.title !== tab.title && (
          <span
            className="text-[10px] text-blue-500 flex-shrink-0"
            title={`프로필: ${profileMatch.profileName}`}
          >
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
    </div>
  );
}

// ── 정적 탭 (고정 탭용, 드래그 불가) ──

function StaticTabItem({
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
  const profileMatch = tab.url ? profileTitleMap.get(normalizeUrl(tab.url)) : undefined;
  const displayTitle = profileMatch?.title ?? tab.title ?? tab.url;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 mx-1 rounded cursor-pointer group
        hover:bg-white/60 dark:hover:bg-gray-700/40"
      onClick={onClick}
    >
      <FavIcon url={tab.favIconUrl} />
      <span
        className="text-xs truncate flex-1"
        title={
          profileMatch
            ? `프로필 "${profileMatch.profileName}"의 커스텀 이름\n원본: ${tab.title}`
            : tab.title
        }
      >
        {displayTitle}
      </span>
      {profileMatch && profileMatch.title !== tab.title && (
        <span
          className="text-[10px] text-blue-500 flex-shrink-0"
          title={`프로필: ${profileMatch.profileName}`}
        >
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

// ── 파비콘 컴포넌트 ──

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
