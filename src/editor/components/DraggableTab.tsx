import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Tab } from '../../shared/types';
import { useTabStore } from '../../shared/store/tabStore';
import InlineEditText from '../../shared/components/InlineEditText';
import type { DropIndicatorState } from './EditorArea';

interface Props {
  tab: Tab;
  groupId: string;
  dropIndicator: DropIndicatorState | null;
}

export default function DraggableTab({ tab, groupId, dropIndicator }: Props) {
  const selectItem = useTabStore((s) => s.selectItem);
  const selectedItemId = useTabStore((s) => s.selectedItemId);
  const deleteTab = useTabStore((s) => s.deleteTab);
  const updateTab = useTabStore((s) => s.updateTab);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isSelected = selectedItemId === tab.id;
  const showBefore = dropIndicator?.targetId === tab.id && dropIndicator.position === 'before';
  const showAfter = dropIndicator?.targetId === tab.id && dropIndicator.position === 'after';

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showBefore && (
        <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-500 z-10 ml-2" />
      )}

      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer group ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-300'
            : 'hover:bg-white/60 dark:hover:bg-gray-700/40'
        }`}
        onClick={() => selectItem(tab.id, 'tab')}
      >
        {/* 드래그 핸들 */}
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-xs"
          title="드래그하여 이동"
        >
          ⠿
        </span>

        {/* 파비콘 */}
        {tab.favIconUrl ? (
          <img
            src={tab.favIconUrl}
            alt=""
            className="w-4 h-4 flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="w-4 h-4 rounded bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
        )}

        {/* 제목 (더블클릭으로 편집) */}
        <InlineEditText
          value={tab.title || tab.url}
          onCommit={(title) => updateTab(groupId, tab.id, { title })}
          className="text-xs truncate flex-1"
          inputClassName="text-xs w-full"
        />

        {/* 고정 표시 */}
        {tab.pinned && <span className="text-xs text-gray-400">📌</span>}

        {/* 삭제 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteTab(groupId, tab.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs px-1"
        >
          ×
        </button>
      </div>

      {showAfter && (
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-500 z-10 ml-2" />
      )}
    </div>
  );
}
