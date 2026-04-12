import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Group } from '../../shared/types';
import { COLOR_MAP, COLOR_MAP_LIGHT } from '../../shared/utils/colors';
import { useTabStore } from '../../shared/store/tabStore';
import InlineEditText from '../../shared/components/InlineEditText';
import DraggableTab from './DraggableTab';
import type { DropIndicatorState } from './EditorArea';

interface Props {
  group: Group;
  dropIndicator: DropIndicatorState | null;
}

export default function DraggableGroup({ group, dropIndicator }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAddTab, setShowAddTab] = useState(false);
  const [newTabUrl, setNewTabUrl] = useState('');
  const [newTabTitle, setNewTabTitle] = useState('');

  const selectItem = useTabStore((s) => s.selectItem);
  const selectedItemId = useTabStore((s) => s.selectedItemId);
  const deleteGroup = useTabStore((s) => s.deleteGroup);
  const updateGroup = useTabStore((s) => s.updateGroup);
  const addTab = useTabStore((s) => s.addTab);

  const sortableId = `g-${group.id}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const borderColor = COLOR_MAP[group.color];
  const bgColor = COLOR_MAP_LIGHT[group.color];
  const isSelected = selectedItemId === group.id;

  const showBefore = dropIndicator?.targetId === sortableId && dropIndicator.position === 'before';
  const showAfter = dropIndicator?.targetId === sortableId && dropIndicator.position === 'after';
  const showInside = dropIndicator?.targetId === sortableId && dropIndicator.position === 'inside';

  const handleAddTab = () => {
    if (!newTabUrl.trim()) return;
    addTab(group.id, {
      url: newTabUrl.trim(),
      title: newTabTitle.trim() || newTabUrl.trim(),
      favIconUrl: null,
      pinned: false,
    });
    setNewTabUrl('');
    setNewTabTitle('');
    setShowAddTab(false);
  };

  const tabIds = group.tabs.map((t) => t.id);

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showBefore && (
        <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-500 z-10" />
      )}

      <div
        className={`rounded-lg border-l-4 overflow-hidden shadow-sm transition-shadow ${
          showInside
            ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/30 dark:bg-blue-900/20'
            : isSelected
              ? 'ring-2 ring-blue-400'
              : ''
        }`}
        style={{ borderLeftColor: borderColor, backgroundColor: bgColor + '30' }}
      >
        {/* 그룹 헤더 */}
        <div
          className="flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-gray-800/80 cursor-pointer"
          onClick={() => selectItem(group.id, 'group')}
        >
          {/* 드래그 핸들 */}
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
            title="드래그하여 순서 변경"
          >
            ⠿
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="text-xs text-gray-400"
          >
            {collapsed ? '▶' : '▼'}
          </button>

          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: borderColor }}
          />
          <InlineEditText
            value={group.name}
            onCommit={(name) => updateGroup(group.id, { name })}
            className="text-sm font-medium flex-1 truncate"
            inputClassName="text-sm font-medium w-full"
          />
          <span className="text-xs text-gray-500">{group.tabs.length}개</span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`"${group.name}" 그룹을 삭제하시겠습니까?`)) {
                deleteGroup(group.id);
              }
            }}
            className="text-gray-400 hover:text-red-500 text-sm px-1"
            title="그룹 삭제"
          >
            ×
          </button>
        </div>

        {/* 탭 목록 */}
        {!collapsed && (
          <div className="px-2 pb-2">
            <SortableContext items={tabIds} strategy={verticalListSortingStrategy}>
              {group.tabs.map((tab) => (
                <DraggableTab
                  key={tab.id}
                  tab={tab}
                  groupId={group.id}
                  dropIndicator={dropIndicator}
                />
              ))}
            </SortableContext>

            {/* 탭 추가 */}
            {showAddTab ? (
              <div className="mt-1 p-2 bg-white dark:bg-gray-800 rounded space-y-1.5">
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
                <div className="flex gap-1 justify-end">
                  <button
                    onClick={() => setShowAddTab(false)}
                    className="btn-secondary text-xs"
                  >
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
              <button
                onClick={() => setShowAddTab(true)}
                className="w-full mt-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-1 rounded hover:bg-white/50 dark:hover:bg-gray-700/50"
              >
                + 탭 추가
              </button>
            )}
          </div>
        )}
      </div>

      {showAfter && (
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-500 z-10" />
      )}
    </div>
  );
}
