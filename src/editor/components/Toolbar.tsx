import { useTabStore } from '../../shared/store/tabStore';

interface Props {
  onSave: () => void;
  hasChanges: boolean;
}

export default function Toolbar({ onSave, hasChanges }: Props) {
  const undo = useTabStore((s) => s.undo);
  const redo = useTabStore((s) => s.redo);
  const canUndo = useTabStore((s) => s.canUndo());
  const canRedo = useTabStore((s) => s.canRedo());
  const currentProfile = useTabStore((s) => s.currentProfile);

  const handleImportCurrent = async () => {
    if (!currentProfile) return;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TABS' });
      if (result?.tabs) {
        // 현재 열린 탭 정보를 그룹으로 변환하여 추가
        const { addGroup, addTab } = useTabStore.getState();
        addGroup({ name: '현재 탭', color: 'blue', domain: null });
        const state = useTabStore.getState();
        const newGroup = state.currentProfile?.groups[state.currentProfile.groups.length - 1];
        if (newGroup) {
          for (const tab of result.tabs as chrome.tabs.Tab[]) {
            addTab(newGroup.id, {
              url: tab.url ?? '',
              title: tab.title ?? '',
              favIconUrl: tab.favIconUrl ?? null,
              pinned: tab.pinned ?? false,
            });
          }
        }
      }
    } catch {
      // 에러 무시
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-white dark:bg-gray-800 shadow-sm">
      <h1 className="text-sm font-bold mr-auto">
        Tab Manager Pro — Editor
      </h1>

      <button
        onClick={handleImportCurrent}
        disabled={!currentProfile}
        className="btn-secondary text-xs disabled:opacity-50"
      >
        현재 탭 가져오기
      </button>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />

      <button
        onClick={undo}
        disabled={!canUndo}
        className="btn-icon disabled:opacity-30"
        title="실행 취소 (Ctrl+Z)"
      >
        ↩
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        className="btn-icon disabled:opacity-30"
        title="다시 실행 (Ctrl+Y)"
      >
        ↪
      </button>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />

      <button
        onClick={onSave}
        disabled={!hasChanges}
        className={`btn text-xs ${
          hasChanges
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        저장
      </button>
    </div>
  );
}
