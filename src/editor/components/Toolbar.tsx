import { useTabStore } from '../../shared/store/tabStore';
import { useProfileStore } from '../../shared/store/profileStore';
import { t } from '../../shared/i18n';

interface Props {
  onSave: () => void;
  hasChanges: boolean;
}

export default function Toolbar({ onSave, hasChanges }: Props) {
  const profiles = useProfileStore((s) => s.profiles);
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
        const { addStandaloneTab } = useTabStore.getState();
        for (const tab of result.tabs as chrome.tabs.Tab[]) {
          addStandaloneTab({
            url: tab.url ?? '',
            title: tab.title ?? '',
            favIconUrl: tab.favIconUrl ?? null,
            pinned: tab.pinned ?? false,
          });
        }
      }
    } catch {
      // ignore
    }
  };

  const handleExportAll = () => {
    const json = JSON.stringify(profiles, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-manager-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        const arr = Array.isArray(imported) ? imported : [imported];
        for (const p of arr) {
          if (p && p.name && (p.items || p.groups)) {
            await useProfileStore.getState().saveProfile({
              ...p,
              id: p.id ?? crypto.randomUUID(),
              createdAt: p.createdAt ?? Date.now(),
              updatedAt: Date.now(),
            });
          }
        }
        await useProfileStore.getState().loadProfiles();
      } catch {
        // parse error
      }
    };
    input.click();
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-white dark:bg-gray-800 shadow-sm">
      <h1 className="text-sm font-bold mr-auto">
        Tab Manager Pro — Editor
      </h1>

      <button onClick={handleExportAll} disabled={profiles.length === 0} className="btn-secondary text-xs disabled:opacity-50" title={t('exportAll')}>
        {t('export')}
      </button>
      <button onClick={handleImportFile} className="btn-secondary text-xs" title={t('importJson')}>
        {t('import')}
      </button>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />

      <button
        onClick={handleImportCurrent}
        disabled={!currentProfile}
        className="btn-secondary text-xs disabled:opacity-50"
      >
        {t('importCurrentTabs')}
      </button>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />

      <button
        onClick={undo}
        disabled={!canUndo}
        className="btn-icon disabled:opacity-30"
        title={t('undoTooltip')}
      >
        ↩
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        className="btn-icon disabled:opacity-30"
        title={t('redoTooltip')}
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
        {t('save')}
      </button>
    </div>
  );
}
