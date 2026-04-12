import { useState } from 'react';
import { useChromeTabs } from '../../shared/hooks/useChromeTabs';
import { findDuplicates } from '../../shared/utils/dedup';
import { t } from '../../shared/i18n';

interface Props {
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function DuplicateDetector({ onShowToast }: Props) {
  const { tabs } = useChromeTabs();
  const [keepTabIds, setKeepTabIds] = useState<Map<string, number>>(new Map());
  const [isRemoving, setIsRemoving] = useState(false);

  const duplicates = findDuplicates(tabs);

  const getKeepId = (key: string, dupTabs: chrome.tabs.Tab[]) => {
    return keepTabIds.get(key) ?? dupTabs[0].id!;
  };

  const handleSelectKeep = (key: string, tabId: number) => {
    setKeepTabIds((prev) => {
      const next = new Map(prev);
      next.set(key, tabId);
      return next;
    });
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const keepIds: number[] = [];
      for (const [key, dupTabs] of duplicates) {
        keepIds.push(getKeepId(key, dupTabs));
      }

      const result = await chrome.runtime.sendMessage({
        type: 'REMOVE_DUPLICATES',
        keepTabIds: keepIds,
      });

      if (result.success) {
        onShowToast(t('duplicatesRemoved', result.removed));
        setKeepTabIds(new Map());
      } else {
        onShowToast(t('removeDuplicatesFailed'), 'error');
      }
    } catch {
      onShowToast(t('removeDuplicatesError'), 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  if (duplicates.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-gray-400 text-sm space-y-2">
        <span className="text-3xl">✓</span>
        <span>{t('noDuplicates')}</span>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {t('duplicatesFound', duplicates.size)}
        </span>
        <button
          onClick={handleRemove}
          disabled={isRemoving}
          className="btn-danger text-xs disabled:opacity-50"
        >
          {isRemoving ? t('removing') : t('removeDuplicates')}
        </button>
      </div>

      <div className="space-y-2">
        {[...duplicates.entries()].map(([key, dupTabs]) => {
          const selectedId = getKeepId(key, dupTabs);
          return (
            <div key={key} className="card p-2 space-y-1">
              <div className="text-xs text-gray-500 truncate px-1" title={key}>
                {key}
              </div>
              {dupTabs.map((tab) => (
                <label
                  key={tab.id}
                  className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs ${
                    selectedId === tab.id
                      ? 'bg-blue-50 dark:bg-blue-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`dup-${key}`}
                    checked={selectedId === tab.id}
                    onChange={() => handleSelectKeep(key, tab.id!)}
                    className="flex-shrink-0"
                  />
                  {tab.favIconUrl ? (
                    <img src={tab.favIconUrl} alt="" className="w-3 h-3 flex-shrink-0" />
                  ) : (
                    <span className="w-3 h-3 rounded bg-gray-300 flex-shrink-0" />
                  )}
                  <span className="truncate">{tab.title || tab.url}</span>
                  {selectedId === tab.id && (
                    <span className="text-blue-600 ml-auto flex-shrink-0">{t('keep')}</span>
                  )}
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
