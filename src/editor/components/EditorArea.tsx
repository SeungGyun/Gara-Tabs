import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
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

export default function EditorArea() {
  const currentProfile = useTabStore((s) => s.currentProfile);
  const addGroup = useTabStore((s) => s.addGroup);
  const addStandaloneTab = useTabStore((s) => s.addStandaloneTab);
  const renameProfile = useTabStore((s) => s.renameProfile);
  const reorderItems = useTabStore((s) => s.reorderItems);
  const moveTab = useTabStore((s) => s.moveTab);
  const moveTabToGroup = useTabStore((s) => s.moveTabToGroup);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'group' | 'tab' | 'standalone-tab' | null>(null);
  const [dropIntoGroupId, setDropIntoGroupId] = useState<string | null>(null);
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

  // 검색 필터
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

  // 최상위 정렬 ID
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

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const activeIdStr = event.active.id as string;
    // 탭이 그룹 헤더 위에 있으면 drop-into
    if (activeIdStr.startsWith('g-')) {
      setDropIntoGroupId(null);
      return;
    }
    const overId = event.over?.id as string | undefined;
    if (overId?.startsWith('g-')) {
      const groupId = overId.slice(2);
      // 그룹 내 탭이 자기 그룹 위에 있으면 무시
      if (!activeIdStr.startsWith('st-')) {
        // 일반 탭 (그룹 내부) — 소속 그룹과 같으면 무시
        for (const item of allItems) {
          if (item.kind === 'group' && item.group.id === groupId) {
            if (item.group.tabs.some((t) => t.id === activeIdStr)) {
              setDropIntoGroupId(null);
              return;
            }
          }
        }
      }
      setDropIntoGroupId(groupId);
      return;
    }
    setDropIntoGroupId(null);
  }, [allItems]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const currentDropIntoGroupId = dropIntoGroupId;

    setActiveId(null);
    setActiveType(null);
    setDropIntoGroupId(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    if (activeIdStr === overIdStr) return;

    // Case 1: Drop into group (tab or standalone-tab → group header)
    if (currentDropIntoGroupId || overIdStr.startsWith('g-')) {
      const targetGroupId = currentDropIntoGroupId ?? overIdStr.slice(2);

      if (activeIdStr.startsWith('st-')) {
        // 독립 탭 → 그룹
        const tabId = activeIdStr.slice(3);
        const targetGroup = allItems.find(
          (i) => i.kind === 'group' && i.group.id === targetGroupId,
        );
        if (targetGroup && targetGroup.kind === 'group') {
          moveTabToGroup(tabId, targetGroupId, targetGroup.group.tabs.length);
        }
      } else if (!activeIdStr.startsWith('g-')) {
        // 그룹 내 탭 → 다른 그룹
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

    // Case 2: Top-level item reorder (group ↔ standalone-tab)
    if (
      (activeIdStr.startsWith('g-') || activeIdStr.startsWith('st-')) &&
      (overIdStr.startsWith('g-') || overIdStr.startsWith('st-'))
    ) {
      const fromIndex = topLevelIds.indexOf(activeIdStr);
      const toIndex = topLevelIds.indexOf(overIdStr);
      if (fromIndex >= 0 && toIndex >= 0) {
        // Map to allItems indices (in case of filtering)
        const activeItem = items[fromIndex];
        const overItem = items[toIndex];
        const realFrom = allItems.indexOf(activeItem);
        const realTo = allItems.indexOf(overItem);
        if (realFrom >= 0 && realTo >= 0) {
          reorderItems(realFrom, realTo);
        }
      }
      return;
    }

    // Case 3: Tab reorder within/between groups
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

      // Find target
      let toGroupId = '';
      if (!overIdStr.startsWith('g-') && !overIdStr.startsWith('st-')) {
        // Over another tab — find its group
        for (const item of allItems) {
          if (item.kind === 'group' && item.group.tabs.some((t) => t.id === overIdStr)) {
            toGroupId = item.group.id;
            break;
          }
        }
      }

      if (fromGroupId && toGroupId) {
        const toGroup = allItems.find(
          (i) => i.kind === 'group' && i.group.id === toGroupId,
        );
        if (toGroup && toGroup.kind === 'group') {
          let newIndex = toGroup.group.tabs.length;
          const overTabIdx = toGroup.group.tabs.findIndex((t) => t.id === overIdStr);
          if (overTabIdx >= 0) newIndex = overTabIdx;
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
              {profileGroupCount(currentProfile)}개 그룹 · {profileTabCount(currentProfile)}개 탭
            </p>
          </div>
        </div>
        <input
          type="text"
          placeholder="그룹/탭 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input text-sm"
        />
        {searchQuery && (
          <p className="text-xs text-gray-400">
            {items.length}개 항목 일치
          </p>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {items.map((item) => {
              if (item.kind === 'group') {
                return (
                  <DraggableGroup
                    key={item.group.id}
                    group={item.group}
                    isDropTarget={dropIntoGroupId === item.group.id}
                  />
                );
              }
              return (
                <DraggableStandaloneTab
                  key={item.tab.id}
                  tab={item.tab}
                />
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay>
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
                // 독립 탭에서 찾기
                const standalone = allItems.find((i) => i.kind === 'tab' && i.tab.id === tabId);
                if (standalone?.kind === 'tab') return standalone.tab.title;
                // 그룹 내 탭에서 찾기
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
              placeholder="그룹 이름..."
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
                취소
              </button>
              <button
                onClick={handleAddGroup}
                disabled={!newGroupName.trim()}
                className="btn-primary text-xs disabled:opacity-50"
              >
                추가
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
              placeholder="제목 (선택)"
              value={newTabTitle}
              onChange={(e) => setNewTabTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTab()}
              className="input text-xs"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddTab(false)} className="btn-secondary text-xs">
                취소
              </button>
              <button
                onClick={handleAddTab}
                disabled={!newTabUrl.trim()}
                className="btn-primary text-xs disabled:opacity-50"
              >
                추가
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddGroup(true)}
              className="btn-secondary text-xs flex-1"
            >
              + 그룹 추가
            </button>
            <button
              onClick={() => setShowAddTab(true)}
              className="btn-secondary text-xs flex-1"
            >
              + 탭 추가
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
