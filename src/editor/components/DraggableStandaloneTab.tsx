import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Tab } from '../../shared/types';
import { useTabStore } from '../../shared/store/tabStore';
import InlineEditText from '../../shared/components/InlineEditText';
import type { DropIndicatorState } from './EditorArea';
import { t } from '../../shared/i18n';

interface Props {
  tab: Tab;
  dropIndicator: DropIndicatorState | null;
}

export default function DraggableStandaloneTab({ tab, dropIndicator }: Props) {
  const selectItem = useTabStore((s) => s.selectItem);
  const selectedItemId = useTabStore((s) => s.selectedItemId);
  const deleteStandaloneTab = useTabStore((s) => s.deleteStandaloneTab);
  const updateStandaloneTab = useTabStore((s) => s.updateStandaloneTab);

  const sortableId = `st-${tab.id}`;
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

  const isSelected = selectedItemId === tab.id;
  const showBefore = dropIndicator?.targetId === sortableId && dropIndicator.position === 'before';
  const showAfter = dropIndicator?.targetId === sortableId && dropIndicator.position === 'after';

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showBefore && (
        <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-500 z-10" />
      )}

      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer group ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-300 border-blue-200'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
        }`}
        onClick={() => selectItem(tab.id, 'tab')}
      >
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 text-xs"
          title={t('dragToMove')}
        >
          ⠿
        </span>

        {tab.pinned && <span className="text-xs text-gray-400">📌</span>}

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

        <InlineEditText
          value={tab.title || tab.url}
          onCommit={(title) => updateStandaloneTab(tab.id, { title })}
          className="text-sm truncate flex-1"
          inputClassName="text-sm w-full"
        />

        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteStandaloneTab(tab.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs px-1"
        >
          ×
        </button>
      </div>

      {showAfter && (
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-500 z-10" />
      )}
    </div>
  );
}
