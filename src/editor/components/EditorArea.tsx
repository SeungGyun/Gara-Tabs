import { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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
} from '@dnd-kit/sortable';
import { useTabStore } from '../../shared/store/tabStore';
import { profileTabCount, profileGroupCount, TAB_GROUP_COLORS, type ChromeTabGroupColor } from '../../shared/types';
import InlineEditText from '../../shared/components/InlineEditText';
import DraggableGroup from './DraggableGroup';
import DraggableStandaloneTab from './DraggableStandaloneTab';
import { t } from '../../shared/i18n';

// ── 드롭 인디케이터 타입 ──

export type DropPosition = 'before' | 'after' | 'inside';

export interface DropIndicatorState {
  targetId: string;
  position: DropPosition;
}

export default function EditorArea() {
  const currentProfile = useTabStore((s) => s.currentProfile);
  const addGroup = useTabStore((s) => s.addGroup);
  const addStandaloneTab = useTabStore((s) => s.addStandaloneTab);
  const renameProfile = useTabStore((s) => s.renameProfile);
  const reorderItems = useTabStore((s) => s.reorderItems);
  const moveTab = useTabStore((s) => s.moveTab);
  const moveTabToGroup = useTabStore((s) => s.moveTabToGroup);
  const moveTabToStandalone = useTabStore((s) => s.moveTabToStandalone);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'group' | 'tab' | 'standalone-tab' | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null);
  const dropIndicatorRef = useRef<DropIndicatorState | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<ChromeTabGroupColor>('blue');
  const [showAddTab, setShowAddTab] = useState(false);
  const [newTabUrl, setNewTabUrl] = useState('');
  const [newTabTitle, setNewTabTitle] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const [searchQuery, setSearchQuery] = useState('');

  if (!currentProfile) return null;

  const allItems = currentProfile.items;

  const items = searchQuery
    ? allItems.filter((item) => {
        const q = searchQuery.toLowerCase();
        if (item.kind === 'group') {
          if (item.group.name.toLowerCase().includes(q)) return true;
          return item.group.tabs.some(
            (t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q),
          );
        }
        return item.tab.title.toLowerCase().includes(q) || item.tab.url.toLowerCase().includes(q);
      })
    : allItems;

  const topLevelIds = items.map((item) =>
    item.kind === 'group' ? `g-${item.group.id}` : `st-${item.tab.id}`,
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    if (id.startsWith('g-')) {
      setActiveType('group');
    } else if (id.startsWith('st-')) {
      setActiveType('standalone-tab');
    } else {
      setActiveType('tab');
    }
  };

  // 탭 ID → 소속 그룹 ID 찾기
  const findParentGroupId = useCallback((tabId: string): string | null => {
    for (const item of allItems) {
      if (item.kind === 'group' && item.group.tabs.some((t) => t.id === tabId)) {
        return item.group.id;
      }
    }
    return null;
  }, [allItems]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const { active, over } = event;
    if (!over || !active) {
      setDropIndicator(null);
      dropIndicatorRef.current = null;
      return;
    }

    const activeIdStr = active.id as string;
    let overId = over.id as string;
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
    if (!overId.startsWith('g-') && !overId.startsWith('st-')) {
      const parentGroupId = findParentGroupId(overId);
      if (parentGroupId) {
        const parentGroup = allItems.find((i) => i.kind === 'group' && i.group.id === parentGroupId);
        if (parentGroup && parentGroup.kind === 'group') {
          const tabIndex = parentGroup.group.tabs.findIndex((t) => t.id === overId);
          const isFirstTab = tabIndex === 0;
          const isLastTab = tabIndex === parentGroup.group.tabs.length - 1;
          const rawPosition = relativeY < height * 0.5 ? 'before' : 'after';

          // 그룹 드래그: 항상 부모 그룹으로 리졸브
          if (activeIdStr.startsWith('g-')) {
            const isUpperHalf = tabIndex < parentGroup.group.tabs.length / 2;
            const indicator = {
              targetId: `g-${parentGroupId}`,
              position: (isUpperHalf ? 'before' : 'after') as DropPosition,
            };
            setDropIndicator(indicator);
            dropIndicatorRef.current = indicator;
            return;
          }

          // 탭 드래그: 첫 탭 before → 그룹 앞으로, 끝 탭 after → 그룹 뒤로
          if (isFirstTab && rawPosition === 'before') {
            const indicator = { targetId: `g-${parentGroupId}`, position: 'before' as DropPosition };
            setDropIndicator(indicator);
            dropIndicatorRef.current = indicator;
            return;
          }
          if (isLastTab && rawPosition === 'after') {
            const indicator = { targetId: `g-${parentGroupId}`, position: 'after' as DropPosition };
            setDropIndicator(indicator);
            dropIndicatorRef.current = indicator;
            return;
          }
        }
      }
    }

    let position: DropPosition;

    if (overId.startsWith('g-')) {
      // 그룹 헤더 기준 — 헤더 실제 높이(~40px)로 판단
      const HEADER_H = 40;
      if (activeIdStr.startsWith('g-')) {
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
  }, [allItems, findParentGroupId]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const currentIndicator = dropIndicatorRef.current;

    setActiveId(null);
    setActiveType(null);
    setDropIndicator(null);
    dropIndicatorRef.current = null;

    if (!over || !active || !currentIndicator) return;

    const activeIdStr = active.id as string;
    // handleDragMove에서 리졸브된 targetId 사용 (탭→그룹 변환 반영)
    const overIdStr = currentIndicator.targetId;
    if (activeIdStr === overIdStr) return;

    const { position } = currentIndicator;

    // ── 그룹 헤더에 inside 드롭 → 그룹 안으로 ──
    if (overIdStr.startsWith('g-') && position === 'inside') {
      const targetGroupId = overIdStr.slice(2);

      if (activeIdStr.startsWith('st-')) {
        const tabId = activeIdStr.slice(3);
        const targetGroup = allItems.find(
          (i) => i.kind === 'group' && i.group.id === targetGroupId,
        );
        if (targetGroup && targetGroup.kind === 'group') {
          moveTabToGroup(tabId, targetGroupId, targetGroup.group.tabs.length);
        }
      } else if (!activeIdStr.startsWith('g-')) {
        const tabId = activeIdStr;
        let fromGroupId = '';
        for (const item of allItems) {
          if (item.kind === 'group' && item.group.tabs.some((t) => t.id === tabId)) {
            fromGroupId = item.group.id;
            break;
          }
        }
        if (fromGroupId && fromGroupId !== targetGroupId) {
          const targetGroup = allItems.find(
            (i) => i.kind === 'group' && i.group.id === targetGroupId,
          );
          if (targetGroup && targetGroup.kind === 'group') {
            moveTab(fromGroupId, targetGroupId, tabId, targetGroup.group.tabs.length);
          }
        }
      }
      return;
    }

    // ── 그룹 헤더의 before/after → 독립 위치로 이동 ──
    if (overIdStr.startsWith('g-') && (position === 'before' || position === 'after')) {
      const overTopIdx = topLevelIds.indexOf(overIdStr);
      if (overTopIdx < 0) return;
      const overItem = items[overTopIdx];
      const realOverIdx = allItems.indexOf(overItem);

      if (activeIdStr.startsWith('g-') || activeIdStr.startsWith('st-')) {
        // 그룹/독립탭 간 순서 변경
        const fromTopIdx = topLevelIds.indexOf(activeIdStr);
        if (fromTopIdx < 0) return;
        const activeItem = items[fromTopIdx];
        const realFrom = allItems.indexOf(activeItem);
        let realTo = position === 'before' ? realOverIdx : realOverIdx + 1;
        if (realFrom < realTo) realTo--;
        if (realFrom >= 0 && realTo >= 0) reorderItems(realFrom, realTo);
      } else if (activeIdStr.startsWith('st-')) {
        // 독립탭 이동
        const tabId = activeIdStr.slice(3);
        const fromItem = allItems.find((i) => i.kind === 'tab' && i.tab.id === tabId);
        if (fromItem) {
          const realFrom = allItems.indexOf(fromItem);
          let realTo = position === 'before' ? realOverIdx : realOverIdx + 1;
          if (realFrom < realTo) realTo--;
          if (realFrom >= 0) reorderItems(realFrom, realTo);
        }
      } else {
        // 그룹 내 탭 → 독립으로 꺼내기
        const tabId = activeIdStr;
        let fromGroupId = '';
        for (const item of allItems) {
          if (item.kind === 'group' && item.group.tabs.some((t) => t.id === tabId)) {
            fromGroupId = item.group.id;
            break;
          }
        }
        if (fromGroupId) {
          const realTo = position === 'before' ? realOverIdx : realOverIdx + 1;
          moveTabToStandalone(fromGroupId, tabId, realTo);
        }
      }
      return;
    }

    // ── Top-level reorder (독립탭 ↔ 독립탭, 그룹 ↔ 독립탭) ──
    if (
      (activeIdStr.startsWith('g-') || activeIdStr.startsWith('st-')) &&
      overIdStr.startsWith('st-')
    ) {
      const fromIndex = topLevelIds.indexOf(activeIdStr);
      const toIndex = topLevelIds.indexOf(overIdStr);
      if (fromIndex >= 0 && toIndex >= 0) {
        const activeItem = items[fromIndex];
        const overItem = items[toIndex];
        const realFrom = allItems.indexOf(activeItem);
        let realTo = allItems.indexOf(overItem);
        if (position === 'after') realTo++;
        if (realFrom < realTo) realTo--;
        if (realFrom >= 0 && realTo >= 0) reorderItems(realFrom, realTo);
      }
      return;
    }

    // ── 그룹 내 탭 → 독립 탭 위로 이동 ──
    if (
      !activeIdStr.startsWith('g-') && !activeIdStr.startsWith('st-') &&
      overIdStr.startsWith('st-')
    ) {
      const tabId = activeIdStr;
      let fromGroupId = '';
      for (const item of allItems) {
        if (item.kind === 'group' && item.group.tabs.some((t) => t.id === tabId)) {
          fromGroupId = item.group.id;
          break;
        }
      }
      if (!fromGroupId) return;
      const overTopIdx = topLevelIds.indexOf(overIdStr);
      if (overTopIdx >= 0) {
        let realTo = allItems.indexOf(items[overTopIdx]);
        if (position === 'after') realTo++;
        if (realTo >= 0) moveTabToStandalone(fromGroupId, tabId, realTo);
      }
      return;
    }

    // ── 독립 탭 → 그룹 내 탭 위에 드롭 ──
    if (
      activeIdStr.startsWith('st-') &&
      !overIdStr.startsWith('g-') && !overIdStr.startsWith('st-')
    ) {
      const tabId = activeIdStr.slice(3);
      for (const item of allItems) {
        if (item.kind === 'group') {
          const overTabIdx = item.group.tabs.findIndex((t) => t.id === overIdStr);
          if (overTabIdx >= 0) {
            const targetIdx = position === 'before' ? overTabIdx : overTabIdx + 1;
            moveTabToGroup(tabId, item.group.id, targetIdx);
            return;
          }
        }
      }
      return;
    }

    // ── 탭 간 이동 (같은/다른 그룹) ──
    if (!activeIdStr.startsWith('g-') && !activeIdStr.startsWith('st-')) {
      const tabId = activeIdStr;
      let fromGroupId = '';
      for (const item of allItems) {
        if (item.kind === 'group' && item.group.tabs.some((t) => t.id === tabId)) {
          fromGroupId = item.group.id;
          break;
        }
      }
      if (!fromGroupId) return;

      let toGroupId = '';
      if (!overIdStr.startsWith('g-') && !overIdStr.startsWith('st-')) {
        for (const item of allItems) {
          if (item.kind === 'group' && item.group.tabs.some((t) => t.id === overIdStr)) {
            toGroupId = item.group.id;
            break;
          }
        }
      }
      if (fromGroupId && toGroupId) {
        const toGroup = allItems.find((i) => i.kind === 'group' && i.group.id === toGroupId);
        if (toGroup && toGroup.kind === 'group') {
          const overTabIdx = toGroup.group.tabs.findIndex((t) => t.id === overIdStr);
          let newIndex = position === 'before' ? overTabIdx : overTabIdx + 1;
          if (newIndex < 0) newIndex = toGroup.group.tabs.length;
          moveTab(fromGroupId, toGroupId, tabId, newIndex);
        }
      }
    }
  };

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    addGroup({ name: newGroupName.trim(), color: newGroupColor, domain: null });
    setNewGroupName('');
    setNewGroupColor('blue');
    setShowAddGroup(false);
  };

  const handleAddTab = () => {
    if (!newTabUrl.trim()) return;
    addStandaloneTab({
      url: newTabUrl.trim(),
      title: newTabTitle.trim() || newTabUrl.trim(),
      favIconUrl: null,
      pinned: false,
    });
    setNewTabUrl('');
    setNewTabTitle('');
    setShowAddTab(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <InlineEditText
              value={currentProfile.name}
              onCommit={renameProfile}
              className="text-lg font-bold"
              inputClassName="text-lg font-bold w-64"
            />
            <p className="text-xs text-gray-500">
              {t('groupsAndTabs', profileGroupCount(currentProfile), profileTabCount(currentProfile))}
            </p>
          </div>
        </div>
        <input
          type="text"
          placeholder={t('searchGroupsAndTabs')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input text-sm"
        />
        {searchQuery && (
          <p className="text-xs text-gray-400">
            {t('matchingItems', items.length)}
          </p>
        )}
      </div>

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
          <div className="space-y-3">
            {items.map((item) => (
              item.kind === 'group' ? (
                <DraggableGroup
                  key={item.group.id}
                  group={item.group}
                  dropIndicator={dropIndicator}
                />
              ) : (
                <DraggableStandaloneTab
                  key={item.tab.id}
                  tab={item.tab}
                  dropIndicator={dropIndicator}
                />
              )
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeId && activeType === 'group' && (
            <div className="opacity-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border p-3 text-sm">
              {allItems.find((i) => i.kind === 'group' && i.group.id === activeId.slice(2))?.kind === 'group'
                ? (allItems.find((i) => i.kind === 'group' && i.group.id === activeId.slice(2)) as { kind: 'group'; group: { name: string } }).group.name
                : ''}
            </div>
          )}
          {activeId && (activeType === 'tab' || activeType === 'standalone-tab') && (
            <div className="opacity-80 bg-white dark:bg-gray-800 rounded shadow border px-3 py-1.5 text-xs">
              {(() => {
                const tabId = activeType === 'standalone-tab' ? activeId.slice(3) : activeId;
                const standalone = allItems.find((i) => i.kind === 'tab' && i.tab.id === tabId);
                if (standalone?.kind === 'tab') return standalone.tab.title;
                for (const item of allItems) {
                  if (item.kind === 'group') {
                    const t = item.group.tabs.find((t) => t.id === tabId);
                    if (t) return t.title;
                  }
                }
                return '';
              })()}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* 추가 버튼 */}
      <div className="mt-4 space-y-2">
        {showAddGroup ? (
          <div className="card p-3 space-y-2">
            <input
              type="text"
              placeholder={t('groupNamePlaceholder')}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
              className="input"
              autoFocus
            />
            <div className="flex gap-1 flex-wrap">
              {TAB_GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewGroupColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${
                    newGroupColor === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
                  }`}
                  title={c}
                >
                  <span
                    className="block w-full h-full rounded-full"
                    style={{
                      backgroundColor:
                        ({ grey: '#5f6368', blue: '#1a73e8', red: '#d93025', yellow: '#f9ab00', green: '#188038', pink: '#d01884', purple: '#a142f4', cyan: '#007b83', orange: '#e8710a' } as Record<string, string>)[c],
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddGroup(false)} className="btn-secondary text-xs">
                {t('cancel')}
              </button>
              <button
                onClick={handleAddGroup}
                disabled={!newGroupName.trim()}
                className="btn-primary text-xs disabled:opacity-50"
              >
                {t('add')}
              </button>
            </div>
          </div>
        ) : showAddTab ? (
          <div className="card p-3 space-y-2">
            <input
              type="text"
              placeholder="URL"
              value={newTabUrl}
              onChange={(e) => setNewTabUrl(e.target.value)}
              className="input text-xs"
              autoFocus
            />
            <input
              type="text"
              placeholder={t('titleOptional')}
              value={newTabTitle}
              onChange={(e) => setNewTabTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTab()}
              className="input text-xs"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddTab(false)} className="btn-secondary text-xs">
                {t('cancel')}
              </button>
              <button
                onClick={handleAddTab}
                disabled={!newTabUrl.trim()}
                className="btn-primary text-xs disabled:opacity-50"
              >
                {t('add')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddGroup(true)}
              className="btn-secondary text-xs flex-1"
            >
              {t('addGroup')}
            </button>
            <button
              onClick={() => setShowAddTab(true)}
              className="btn-secondary text-xs flex-1"
            >
              {t('addTab')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
