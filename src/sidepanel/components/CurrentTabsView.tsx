import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
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
  type SimpleTab,
} from '../../shared/utils/tabDragLogic';
import type { ChromeTabGroupColor } from '../../shared/types';
import { t } from '../../shared/i18n';

// ── 드롭 인디케이터 타입 ──

type DropPosition = 'before' | 'after' | 'inside';

interface DropIndicatorState {
  targetId: string;
  position: DropPosition;
}

// ── 메인 컴포넌트 ──

export default function CurrentTabsView() {
  const { tabs, isLoading, refresh } = useChromeTabs();
  const { groups } = useTabGroups();
  const profiles = useProfileStore((s) => s.profiles);

  // DnD 상태
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null);
  const dropIndicatorRef = useRef<DropIndicatorState | null>(null);

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

  const tabLookup = useMemo(() => {
    const map = new Map<number, { index: number; groupId: number }>();
    for (const tab of tabs) {
      if (tab.id != null) {
        map.set(tab.id, { index: tab.index ?? 0, groupId: tab.groupId ?? -1 });
      }
    }
    return map;
  }, [tabs]);

  const topLevelIds = useMemo(() => {
    return segments
      .filter((s) => s.kind !== 'pinned')
      .map((s) => (s.kind === 'group' ? `g-${s.groupId}` : `t-${s.tab.id}`));
  }, [segments]);

  const nonPinnedSegments = useMemo(() => {
    return segments.filter((s) => s.kind !== 'pinned');
  }, [segments]);

  const isDraggingTab = useMemo(() => {
    return activeId != null && activeId.startsWith('t-');
  }, [activeId]);

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

  const handleRenameGroup = useCallback(async (groupId: number, title: string) => {
    await chrome.runtime.sendMessage({ type: 'RENAME_GROUP', groupId, title });
  }, []);

  const handleCreateGroup = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: 'CREATE_GROUP', title: t('newGroup') });
    refresh();
  }, [refresh]);

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

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const { active, over } = event;
      if (!over || !active) {
        setDropIndicator(null);
        dropIndicatorRef.current = null;
        return;
      }

      const activeIdStr = active.id as string;
      const overId = over.id as string;
      if (activeIdStr === overId) {
        setDropIndicator(null);
        dropIndicatorRef.current = null;
        return;
      }

      const overRect = over.rect;
      if (!overRect) {
        setDropIndicator(null);
        dropIndicatorRef.current = null;
        return;
      }

      const pointerY = (event.activatorEvent as PointerEvent).clientY + event.delta.y;
      const relativeY = pointerY - overRect.top;
      const height = overRect.height;

      // 그룹 내부 탭 위에 호버 → 경계(첫/끝 탭)이면 부모 그룹으로 리졸브
      if (overId.startsWith('t-')) {
        const overTabId = parseInt(overId.slice(2));
        const overTab = tabLookup.get(overTabId);
        if (overTab && overTab.groupId !== -1) {
          const segment = segments.find(
            (s) => s.kind === 'group' && s.groupId === overTab.groupId,
          );
          if (segment && segment.kind === 'group') {
            const tabIndex = segment.tabs.findIndex((t) => t.id === overTabId);
            const isFirstTab = tabIndex === 0;
            const isLastTab = tabIndex === segment.tabs.length - 1;
            const rawPosition = relativeY < height * 0.5 ? 'before' : 'after';

            // 그룹 드래그: 항상 부모 그룹으로 리졸브
            if (activeIdStr.startsWith('g-')) {
              const isUpperHalf = tabIndex < segment.tabs.length / 2;
              const indicator: DropIndicatorState = {
                targetId: `g-${overTab.groupId}`,
                position: isUpperHalf ? 'before' : 'after',
              };
              setDropIndicator(indicator);
              dropIndicatorRef.current = indicator;
              return;
            }

            // 탭 드래그: 첫 탭 before → 그룹 앞으로, 끝 탭 after → 그룹 뒤로
            if (isFirstTab && rawPosition === 'before') {
              const indicator: DropIndicatorState = {
                targetId: `g-${overTab.groupId}`,
                position: 'before',
              };
              setDropIndicator(indicator);
              dropIndicatorRef.current = indicator;
              return;
            }
            if (isLastTab && rawPosition === 'after') {
              const indicator: DropIndicatorState = {
                targetId: `g-${overTab.groupId}`,
                position: 'after',
              };
              setDropIndicator(indicator);
              dropIndicatorRef.current = indicator;
              return;
            }
          }
        }
      }

      let position: DropPosition;

      if (overId.startsWith('g-')) {
        // 그룹 헤더 기준 — 헤더 실제 높이(~36px)로 판단
        const HEADER_H = 36;
        if (!isDraggingTab) {
          // 그룹→그룹: before/after만
          position = relativeY < height * 0.5 ? 'before' : 'after';
        } else if (relativeY < HEADER_H * 0.5) {
          // 제목 상단 50% → 그룹과 같은 레이어 (before)
          position = 'before';
        } else if (relativeY < HEADER_H) {
          // 제목 하단 50% → 그룹 안으로 (inside)
          position = 'inside';
        } else {
          // 제목 아래 (탭 리스트 영역) → 그룹 안으로
          position = 'inside';
        }
      } else {
        // 탭→탭, 독립탭: before/after만
        position = relativeY < height * 0.5 ? 'before' : 'after';
      }

      const indicator = { targetId: overId, position };
      setDropIndicator(indicator);
      dropIndicatorRef.current = indicator;
    },
    [isDraggingTab],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const currentIndicator = dropIndicatorRef.current;

      setActiveId(null);
      setDropIndicator(null);
      dropIndicatorRef.current = null;

      if (!over || !active || !currentIndicator) return;

      const activeIdStr = active.id as string;
      // handleDragMove에서 리졸브된 targetId 사용 (탭→그룹 변환 반영)
      const overIdStr = currentIndicator.targetId;
      if (activeIdStr === overIdStr) return;

      const isActiveGroup = activeIdStr.startsWith('g-');
      const { position } = currentIndicator;

      if (!isActiveGroup) {
        // ── 탭 이동 ──
        const activeTabId = parseInt(activeIdStr.slice(2));
        const activeTab = tabLookup.get(activeTabId);
        if (!activeTab) return;

        // 그룹 헤더에 inside 드롭 → 그룹 안으로
        if (overIdStr.startsWith('g-') && position === 'inside') {
          const targetGroupId = parseInt(overIdStr.slice(2));
          const segment = segments.find(
            (s) => s.kind === 'group' && s.groupId === targetGroupId,
          );
          if (segment && segment.kind === 'group') {
            const lastIdx = segment.tabs[segment.tabs.length - 1].index;
            handleMoveTab(activeTabId, lastIdx + 1, targetGroupId);
          }
          return;
        }

        // 그룹 헤더의 before/after → 그룹 사이로 미분류 이동
        if (overIdStr.startsWith('g-') && (position === 'before' || position === 'after')) {
          const targetGroupId = parseInt(overIdStr.slice(2));
          const segment = segments.find(
            (s) => s.kind === 'group' && s.groupId === targetGroupId,
          );
          if (segment && segment.kind === 'group') {
            const targetIndex = position === 'before'
              ? segment.tabs[0].index
              : segment.tabs[segment.tabs.length - 1].index + 1;
            handleMoveTab(activeTabId, targetIndex, -1);
          }
          return;
        }

        // 탭 → 탭 이동
        if (overIdStr.startsWith('t-')) {
          const overTabId = parseInt(overIdStr.slice(2));
          const overTab = tabLookup.get(overTabId);
          if (!overTab) return;
          const targetGroupId = overTab.groupId;
          const targetIndex = position === 'before' ? overTab.index : overTab.index + 1;
          handleMoveTab(activeTabId, targetIndex, targetGroupId);
        }
      } else {
        // ── 그룹 이동 ──
        const activeGroupId = parseInt(activeIdStr.slice(2));

        if (overIdStr.startsWith('g-')) {
          const overGroupId = parseInt(overIdStr.slice(2));
          const overSegment = segments.find(
            (s) => s.kind === 'group' && s.groupId === overGroupId,
          );
          if (!overSegment || overSegment.kind !== 'group') return;
          const targetIdx = position === 'before'
            ? overSegment.tabs[0].index
            : overSegment.tabs[overSegment.tabs.length - 1].index + 1;
          handleMoveGroup(activeGroupId, targetIdx);
        } else if (overIdStr.startsWith('t-')) {
          const overTabId = parseInt(overIdStr.slice(2));
          const overTab = tabLookup.get(overTabId);
          if (!overTab) return;
          const targetIdx = position === 'before' ? overTab.index : overTab.index + 1;
          handleMoveGroup(activeGroupId, targetIdx);
        }
      }
    },
    [segments, tabLookup, handleMoveTab, handleMoveGroup],
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
      <div className="flex items-center justify-center p-8 text-gray-400">{t('loading')}</div>
    );
  }

  return (
    <div className="p-2">
      <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">{t('tabCount', tabs.length)}</div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always,
          },
        }}
      >
        <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
          {/* 고정 탭 섹션 */}
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
            return null;
          })}

          {/* 그룹/탭 */}
          {nonPinnedSegments.map((segment) => {
            if (segment.kind === 'group') {
              const group = groupMap.get(segment.groupId);
              if (!group) return null;
              const groupTabs = segment.tabs
                .map((st) => tabs.find((t) => t.id === st.id)!)
                .filter(Boolean);
              const tabIds = segment.tabs.map((st) => `t-${st.id}`);
              const sortableId = `g-${group.id}`;

              return (
                <SortableGroupSection
                  key={sortableId}
                  groupId={group.id}
                  title={group.title || t('group')}
                  color={(group.color as ChromeTabGroupColor) ?? 'grey'}
                  tabCount={groupTabs.length}
                  collapsed={group.collapsed}
                  dropIndicator={dropIndicator}
                  onToggle={() => handleToggleCollapsed(group.id, !group.collapsed)}
                  onRename={(title) => handleRenameGroup(group.id, title)}
                >
                  <SortableContext items={tabIds} strategy={verticalListSortingStrategy}>
                    {groupTabs.map((tab) => (
                      <SortableTabItem
                        key={tab.id}
                        tab={tab}
                        profileTitleMap={profileTitleMap}
                        dropIndicator={dropIndicator}
                        onClick={() => tab.id && handleTabClick(tab.id)}
                        onClose={() => tab.id && handleTabClose(tab.id)}
                      />
                    ))}
                  </SortableContext>
                </SortableGroupSection>
              );
            }

            const chromeTab = tabs.find((t) => t.id === segment.tab.id);
            if (!chromeTab) return null;
            return (
              <SortableStandaloneTab
                key={`standalone-${chromeTab.id}`}
                tab={chromeTab}
                profileTitleMap={profileTitleMap}
                dropIndicator={dropIndicator}
                onClick={() => chromeTab.id && handleTabClick(chromeTab.id)}
                onClose={() => chromeTab.id && handleTabClose(chromeTab.id)}
              />
            );
          })}
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeDragData?.type === 'group' && (
            <div className="opacity-80 bg-white dark:bg-gray-800 rounded-md shadow-lg border px-3 py-1.5 text-sm font-medium flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    COLOR_MAP[(activeDragData.group.color as ChromeTabGroupColor) ?? 'grey'],
                }}
              />
              {activeDragData.group.title || t('group')}
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

      {/* 그룹 추가 버튼 */}
      <button
        onClick={handleCreateGroup}
        className="w-full mt-2 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
      >
        {t('addGroup')}
      </button>
    </div>
  );
}

// ── 드롭 인디케이터 라인 컴포넌트 ──

function DropLine({ position, indent = 0 }: { position: 'before' | 'after'; indent?: number }) {
  return (
    <div
      className={`absolute left-0 right-0 h-0.5 bg-blue-500 z-10 ${
        position === 'before' ? 'top-0' : 'bottom-0'
      }`}
      style={{ marginLeft: `${indent}px` }}
    />
  );
}

// ── 고정 탭 섹션 ──

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
          <ChevronIcon open={open} />
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: COLOR_MAP.grey }}
          />
          <span className="truncate flex-1">{t('pinnedTabs')}</span>
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
  dropIndicator,
  onToggle,
  onRename,
  children,
}: {
  groupId: number;
  title: string;
  color: ChromeTabGroupColor;
  tabCount: number;
  collapsed?: boolean;
  dropIndicator: DropIndicatorState | null;
  onToggle: () => void;
  onRename: (title: string) => void;
  children: React.ReactNode;
}) {
  const sortableId = `g-${groupId}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });
  const [editing, setEditing] = useState(false);

  const handleRenameCommit = useCallback((newTitle: string) => {
    setEditing(false);
    if (newTitle.trim() && newTitle.trim() !== title) {
      onRename(newTitle.trim());
    }
  }, [title, onRename]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const open = collapsed !== undefined ? !collapsed : true;
  const bgColor = COLOR_MAP_LIGHT[color] ?? COLOR_MAP_LIGHT.grey;
  const dotColor = COLOR_MAP[color] ?? COLOR_MAP.grey;

  const showBefore = dropIndicator?.targetId === sortableId && dropIndicator.position === 'before';
  const showAfter = dropIndicator?.targetId === sortableId && dropIndicator.position === 'after';
  const showInside = dropIndicator?.targetId === sortableId && dropIndicator.position === 'inside';

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showBefore && <DropLine position="before" />}

      <div
        className={`rounded-md overflow-hidden transition-shadow ${
          showInside ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/30 dark:bg-blue-900/20' : ''
        }`}
        style={{ backgroundColor: bgColor + '40' }}
      >
        <div
          {...attributes}
          {...listeners}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-left cursor-grab active:cursor-grabbing"
        >
          {/* 접기/펼치기 영역: 화살표 + 색상 */}
          <span
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="flex items-center gap-2 flex-shrink-0 cursor-pointer hover:opacity-60 py-0.5 pr-1"
          >
            <ChevronIcon open={open} />
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          </span>
          {/* 제목 영역: 더블클릭으로 편집 */}
          {editing ? (
            <GroupTitleInput
              value={title}
              onCommit={handleRenameCommit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <span
              className="truncate flex-1 cursor-text hover:underline hover:decoration-dotted hover:decoration-gray-400"
              title="더블클릭하여 수정"
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
            >
              {title}
            </span>
          )}
          <span className="text-xs text-gray-500">{tabCount}</span>
        </div>
        {open && <div className="pb-1">{children}</div>}
      </div>

      {showAfter && <DropLine position="after" />}
    </div>
  );
}

// ── 그룹 제목 인라인 편집 입력 ──

function GroupTitleInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(editValue);
        if (e.key === 'Escape') onCancel();
        e.stopPropagation();
      }}
      onBlur={() => onCommit(editValue)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="flex-1 min-w-0 bg-white dark:bg-gray-700 border border-blue-400 rounded px-1 text-sm outline-none"
    />
  );
}

// ── 정렬 가능 탭 (그룹 내부용) ──

function SortableTabItem({
  tab,
  profileTitleMap,
  dropIndicator,
  onClick,
  onClose,
}: {
  tab: chrome.tabs.Tab;
  profileTitleMap: Map<string, { title: string; profileName: string }>;
  dropIndicator: DropIndicatorState | null;
  onClick: () => void;
  onClose: () => void;
}) {
  const sortableId = `t-${tab.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const profileMatch = tab.url ? profileTitleMap.get(normalizeUrl(tab.url)) : undefined;
  const displayTitle = profileMatch?.title ?? tab.title ?? tab.url;

  const showBefore = dropIndicator?.targetId === sortableId && dropIndicator.position === 'before';
  const showAfter = dropIndicator?.targetId === sortableId && dropIndicator.position === 'after';

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showBefore && <DropLine position="before" indent={12} />}

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
              ? t('customNameTooltip', profileMatch.profileName, tab.title ?? '')
              : tab.title
          }
        >
          {displayTitle}
        </span>
        {profileMatch && profileMatch.title !== tab.title && (
          <span
            className="text-[10px] text-blue-500 flex-shrink-0"
            title={t('profileBadgeTooltip', profileMatch.profileName)}
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

      {showAfter && <DropLine position="after" indent={12} />}
    </div>
  );
}

// ── 정렬 가능 미분류 탭 ──

function SortableStandaloneTab({
  tab,
  profileTitleMap,
  dropIndicator,
  onClick,
  onClose,
}: {
  tab: chrome.tabs.Tab;
  profileTitleMap: Map<string, { title: string; profileName: string }>;
  dropIndicator: DropIndicatorState | null;
  onClick: () => void;
  onClose: () => void;
}) {
  const sortableId = `t-${tab.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const profileMatch = tab.url ? profileTitleMap.get(normalizeUrl(tab.url)) : undefined;
  const displayTitle = profileMatch?.title ?? tab.title ?? tab.url;

  const showBefore = dropIndicator?.targetId === sortableId && dropIndicator.position === 'before';
  const showAfter = dropIndicator?.targetId === sortableId && dropIndicator.position === 'after';

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showBefore && <DropLine position="before" />}

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
              ? t('customNameTooltip', profileMatch.profileName, tab.title ?? '')
              : tab.title
          }
        >
          {displayTitle}
        </span>
        {profileMatch && profileMatch.title !== tab.title && (
          <span
            className="text-[10px] text-blue-500 flex-shrink-0"
            title={t('profileBadgeTooltip', profileMatch.profileName)}
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

      {showAfter && <DropLine position="after" />}
    </div>
  );
}

// ── 정적 탭 ──

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

// ── Chevron 아이콘 ──

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : 'rotate-0'}`}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z" />
    </svg>
  );
}

// ── 파비콘 ──

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
