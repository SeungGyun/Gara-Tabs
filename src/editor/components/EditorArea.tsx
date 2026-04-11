import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
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
import { TAB_GROUP_COLORS, type ChromeTabGroupColor } from '../../shared/types';
import DraggableGroup from './DraggableGroup';

export default function EditorArea() {
  const currentProfile = useTabStore((s) => s.currentProfile);
  const addGroup = useTabStore((s) => s.addGroup);
  const reorderGroups = useTabStore((s) => s.reorderGroups);
  const moveTab = useTabStore((s) => s.moveTab);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'group' | 'tab' | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<ChromeTabGroupColor>('blue');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const [searchQuery, setSearchQuery] = useState('');

  if (!currentProfile) return null;

  // 검색 필터 적용
  const allGroups = currentProfile.groups;
  const groups = searchQuery
    ? allGroups
        .map((g) => ({
          ...g,
          tabs: g.tabs.filter(
            (t) =>
              t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              t.url.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
        }))
        .filter((g) =>
          g.tabs.length > 0 ||
          g.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
    : allGroups;
  const groupIds = groups.map((g) => g.id);

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    // 그룹 or 탭 판별
    if (groups.some((g) => g.id === id)) {
      setActiveId(id);
      setActiveType('group');
    } else {
      setActiveId(id);
      setActiveType('tab');
    }
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // 드래그 오버 시 시각적 피드백 (DraggableGroup/Tab에서 처리)
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    if (activeIdStr === overIdStr) return;

    if (activeType === 'group') {
      // 그룹 순서 변경
      const fromIndex = groups.findIndex((g) => g.id === activeIdStr);
      const toIndex = groups.findIndex((g) => g.id === overIdStr);
      if (fromIndex >= 0 && toIndex >= 0) {
        reorderGroups(fromIndex, toIndex);
      }
    } else if (activeType === 'tab') {
      // 탭 이동 (그룹 간)
      let fromGroupId = '';
      let toGroupId = '';

      for (const g of groups) {
        if (g.tabs.some((t) => t.id === activeIdStr)) {
          fromGroupId = g.id;
        }
        if (g.id === overIdStr || g.tabs.some((t) => t.id === overIdStr)) {
          toGroupId = g.id;
        }
      }

      if (fromGroupId && toGroupId) {
        const toGroup = groups.find((g) => g.id === toGroupId);
        let newIndex = toGroup?.tabs.length ?? 0;
        if (toGroup) {
          const overTabIdx = toGroup.tabs.findIndex((t) => t.id === overIdStr);
          if (overTabIdx >= 0) newIndex = overTabIdx;
        }
        moveTab(fromGroupId, toGroupId, activeIdStr, newIndex);
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

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{currentProfile.name}</h2>
            <p className="text-xs text-gray-500">
              {allGroups.length}개 그룹 · {allGroups.reduce((s, g) => s + g.tabs.length, 0)}개 탭
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
            {groups.length}개 그룹 · {groups.reduce((s, g) => s + g.tabs.length, 0)}개 탭 일치
          </p>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {groups.map((group) => (
              <DraggableGroup key={group.id} group={group} />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeId && activeType === 'group' && (
            <div className="opacity-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border p-3 text-sm">
              {groups.find((g) => g.id === activeId)?.name}
            </div>
          )}
          {activeId && activeType === 'tab' && (
            <div className="opacity-80 bg-white dark:bg-gray-800 rounded shadow border px-3 py-1.5 text-xs">
              {groups.flatMap((g) => g.tabs).find((t) => t.id === activeId)?.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* 그룹 추가 */}
      <div className="mt-4">
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
                  style={{ backgroundColor: `var(--color-chrome-${c}, ${c})` }}
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
        ) : (
          <button
            onClick={() => setShowAddGroup(true)}
            className="btn-secondary text-xs w-full"
          >
            + 그룹 추가
          </button>
        )}
      </div>
    </div>
  );
}
