import { useTabStore } from '../../shared/store/tabStore';
import { TAB_GROUP_COLORS, type Tab } from '../../shared/types';
import { COLOR_MAP } from '../../shared/utils/colors';
import { t } from '../../shared/i18n';

export default function PropertyPanel() {
  const currentProfile = useTabStore((s) => s.currentProfile);
  const selectedItemId = useTabStore((s) => s.selectedItemId);
  const selectedItemType = useTabStore((s) => s.selectedItemType);
  const updateGroup = useTabStore((s) => s.updateGroup);
  const updateTab = useTabStore((s) => s.updateTab);
  const updateStandaloneTab = useTabStore((s) => s.updateStandaloneTab);

  if (!currentProfile || !selectedItemId || !selectedItemType) {
    return (
      <div className="w-property border-l bg-white dark:bg-gray-800 flex items-center justify-center">
        <p className="text-xs text-gray-400 text-center px-4 whitespace-pre-line">
          {t('selectToEdit')}
        </p>
      </div>
    );
  }

  if (selectedItemType === 'group') {
    const groupItem = currentProfile.items.find(
      (i) => i.kind === 'group' && i.group.id === selectedItemId,
    );
    if (!groupItem || groupItem.kind !== 'group') return null;
    const group = groupItem.group;

    return (
      <div className="w-property border-l bg-white dark:bg-gray-800 overflow-y-auto">
        <div className="p-4 border-b">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {t('groupProperties')}
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1">{t('name')}</label>
            <input
              type="text"
              value={group.name}
              onChange={(e) => updateGroup(group.id, { name: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">{t('color')}</label>
            <div className="flex gap-1 flex-wrap">
              {TAB_GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateGroup(group.id, { color: c })}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    group.color === c
                      ? 'border-gray-900 dark:border-white scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  title={c}
                >
                  <span
                    className="block w-full h-full rounded-full"
                    style={{ backgroundColor: COLOR_MAP[c] }}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">{t('domain')}</label>
            <input
              type="text"
              value={group.domain ?? ''}
              onChange={(e) =>
                updateGroup(group.id, { domain: e.target.value || null })
              }
              placeholder={t('autoDetected')}
              className="input"
            />
          </div>
          <div className="text-xs text-gray-500">
            {t('tabCountLabel', group.tabs.length)}
          </div>
        </div>
      </div>
    );
  }

  // 탭 선택
  let foundGroupId: string | null = null;
  let foundTab: Tab | undefined;

  const standaloneItem = currentProfile.items.find(
    (i) => i.kind === 'tab' && i.tab.id === selectedItemId,
  );
  if (standaloneItem && standaloneItem.kind === 'tab') {
    foundTab = standaloneItem.tab;
    foundGroupId = null;
  } else {
    for (const item of currentProfile.items) {
      if (item.kind === 'group') {
        const tab = item.group.tabs.find((tab) => tab.id === selectedItemId);
        if (tab) {
          foundGroupId = item.group.id;
          foundTab = tab;
          break;
        }
      }
    }
  }

  if (!foundTab) return null;

  const handleUpdate = (updates: Record<string, unknown>) => {
    if (foundGroupId) {
      updateTab(foundGroupId, foundTab.id, updates);
    } else {
      updateStandaloneTab(foundTab.id, updates);
    }
  };

  return (
    <div className="w-property border-l bg-white dark:bg-gray-800 overflow-y-auto">
      <div className="p-4 border-b">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          {t('tabProperties')}
        </h3>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="text-xs font-medium block mb-1">{t('title')}</label>
          <input
            type="text"
            value={foundTab.title}
            onChange={(e) => handleUpdate({ title: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">{t('url')}</label>
          <input
            type="text"
            value={foundTab.url}
            onChange={(e) => handleUpdate({ url: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1">{t('faviconUrl')}</label>
          <div className="flex items-center gap-2">
            {foundTab.favIconUrl && (
              <img
                src={foundTab.favIconUrl}
                alt=""
                className="w-4 h-4"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <input
              type="text"
              value={foundTab.favIconUrl ?? ''}
              onChange={(e) => handleUpdate({ favIconUrl: e.target.value || null })}
              className="input flex-1"
            />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={foundTab.pinned}
              onChange={(e) => handleUpdate({ pinned: e.target.checked })}
            />
            <span className="text-xs">{t('pinnedTab')}</span>
          </label>
        </div>
        <div className="text-xs text-gray-500">
          {foundGroupId
            ? t('belongsToGroup', currentProfile.items.find((i) => i.kind === 'group' && i.group.id === foundGroupId)?.kind === 'group' ? (currentProfile.items.find((i) => i.kind === 'group' && i.group.id === foundGroupId) as { kind: 'group'; group: { name: string } }).group.name : '')
            : t('standaloneTab')}
        </div>
      </div>
    </div>
  );
}
