import { useState } from 'react';
import type { Profile, ProfileSnapshot, LoadProfileOption } from '../../shared/types';
import { profileTabCount, profileGroupCount } from '../../shared/types';
import { useProfileStore } from '../../shared/store/profileStore';
import { COLOR_MAP } from '../../shared/utils/colors';
import InlineEditText from '../../shared/components/InlineEditText';
import { generateId } from '../../shared/utils/uuid';
import { t, getDateLocale } from '../../shared/i18n';

interface Props {
  profile: Profile;
  onDelete: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function ProfileListItem({ profile, onDelete, onShowToast }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<ProfileSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const refreshFromTabs = useProfileStore((s) => s.refreshFromTabs);
  const getHistory = useProfileStore((s) => s.getHistory);
  const restoreFromHistory = useProfileStore((s) => s.restoreFromHistory);

  const totalTabs = profileTabCount(profile);
  const groupCount = profileGroupCount(profile);

  const handleLoad = async (option: LoadProfileOption) => {
    if (option === 'cancel') {
      setShowLoadDialog(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'LOAD_PROFILE',
        profileId: profile.id,
        option,
      });
      if (result.success) {
        onShowToast(t('profileLoaded', profile.name));
      } else {
        onShowToast(t('profileLoadFailed'), 'error');
      }
    } catch {
      onShowToast(t('profileLoadError'), 'error');
    } finally {
      setIsLoading(false);
      setShowLoadDialog(false);
    }
  };

  const handleOpenEditor = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_EDITOR', profileId: profile.id });
  };

  const handleRename = async (newName: string) => {
    await updateProfile(profile.id, { name: newName });
    onShowToast(t('profileRenamed', newName));
  };

  const handleDuplicate = async () => {
    const clone = structuredClone(profile);
    clone.id = generateId();
    clone.name = profile.name + t('copyLabel');
    clone.createdAt = Date.now();
    clone.updatedAt = Date.now();
    for (const item of clone.items) {
      if (item.kind === 'group') {
        item.group.id = generateId();
        for (const tab of item.group.tabs) tab.id = generateId();
      } else {
        item.tab.id = generateId();
      }
    }
    await saveProfile(clone);
    onShowToast(t('profileDuplicated', clone.name));
  };

  const handleRefreshFromTabs = async () => {
    if (!window.confirm(t('refreshConfirm'))) return;
    setIsRefreshing(true);
    try {
      await refreshFromTabs(profile.id);
      onShowToast(t('profileRefreshed', profile.name));
    } catch {
      onShowToast(t('refreshFailed'), 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleShowHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    const list = await getHistory(profile.id);
    setHistoryList(list);
    setShowHistory(true);
  };

  const handleRestore = async (timestamp: number) => {
    if (!window.confirm(t('restoreConfirm'))) return;
    await restoreFromHistory(profile.id, timestamp);
    onShowToast(t('restored'));
    setShowHistory(false);
  };

  const handleTabClick = (url: string, groupName?: string) => {
    if (url) chrome.runtime.sendMessage({ type: 'FOCUS_OR_OPEN_TAB', url, groupName });
  };

  const dateLocale = getDateLocale();

  return (
    <div className="card overflow-hidden">
      {/* 헤더 */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
      >
        <span className="text-xs text-gray-400">{expanded ? '▼' : '▶'}</span>
        <div className="flex-1 min-w-0">
          <InlineEditText
            value={profile.name}
            onCommit={handleRename}
            className="text-sm font-medium truncate block"
            inputClassName="text-sm font-medium w-full"
          />
          <div className="text-xs text-gray-500">
            {t('groupsAndTabs', groupCount, totalTabs)}
          </div>
        </div>
        <div className="text-xs text-gray-400">
          {new Date(profile.createdAt).toLocaleDateString(dateLocale)}
        </div>
      </div>

      {/* 펼친 상태 */}
      {expanded && (
        <div className="border-t">
          {/* 주요 액션 */}
          <div className="flex gap-1.5 px-2 pt-2">
            <button
              onClick={() => setShowLoadDialog(true)}
              disabled={isLoading}
              className="btn-primary flex-1 text-xs py-2 disabled:opacity-50"
            >
              {isLoading ? t('opening') : t('open')}
            </button>
            <button
              onClick={handleRefreshFromTabs}
              disabled={isRefreshing}
              className="btn-secondary flex-1 text-xs py-2 disabled:opacity-50"
              title={t('overwriteFromTabs')}
            >
              {isRefreshing ? t('refreshing') : t('overwrite')}
            </button>
          </div>
          {/* 보조 도구 */}
          <div className="flex gap-1 px-2 pb-2 pt-1 border-b">
            <button onClick={handleOpenEditor} className="btn-icon text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400 flex-1" title={t('editInEditor')}>
              {t('editLabel')}
            </button>
            <button onClick={handleDuplicate} className="btn-icon text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400 flex-1" title={t('duplicateProfile')}>
              {t('duplicateLabel')}
            </button>
            <button
              onClick={handleShowHistory}
              className={`btn-icon text-[11px] flex-1 ${showHistory ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
              title={t('changeHistory')}
            >
              {t('historyLabel')}
            </button>
            <button onClick={onDelete} className="btn-icon text-[11px] text-gray-400 hover:text-red-600 flex-1" title={t('deleteProfile')}>
              {t('deleteLabel')}
            </button>
          </div>

          {/* 불러오기 다이얼로그 */}
          {showLoadDialog && (
            <div className="p-3 border-b bg-blue-50 dark:bg-blue-900/20 space-y-2">
              <p className="text-xs font-medium">{t('existingTabsOption')}</p>
              <div className="space-y-1">
                <button
                  onClick={() => handleLoad('close_existing')}
                  className="w-full text-left text-xs p-2 rounded hover:bg-blue-100 dark:hover:bg-blue-800/30"
                >
                  {t('closeExistingTabs')}
                </button>
                <button
                  onClick={() => handleLoad('keep_as_group')}
                  className="w-full text-left text-xs p-2 rounded hover:bg-blue-100 dark:hover:bg-blue-800/30"
                >
                  {t('keepAsGroup')}
                </button>
                <button
                  onClick={() => handleLoad('cancel')}
                  className="w-full text-left text-xs p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}

          {/* 히스토리 */}
          {showHistory && (
            <div className="p-2 border-b bg-gray-50 dark:bg-gray-800/50 space-y-1">
              <p className="text-xs font-medium px-1">{t('historyTitle')}</p>
              {historyList.length === 0 ? (
                <p className="text-xs text-gray-400 px-1 py-2">{t('noHistory')}</p>
              ) : (
                historyList.map((snap) => {
                  const tabCount = profileTabCount(snap.profile);
                  const gCount = profileGroupCount(snap.profile);
                  return (
                    <div
                      key={snap.timestamp}
                      className="flex items-center justify-between text-xs bg-white dark:bg-gray-700 rounded px-2 py-1.5"
                    >
                      <div>
                        <span className="text-gray-600 dark:text-gray-300">
                          {new Date(snap.timestamp).toLocaleString(dateLocale, {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        <span className="text-gray-400 ml-1.5">
                          {t('groupsAndTabsShort', gCount, tabCount)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRestore(snap.timestamp)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                      >
                        {t('restore')}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 아이템 트리 */}
          <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
            {profile.items.map((item) => {
              if (item.kind === 'group') {
                const group = item.group;
                return (
                  <div key={group.id}>
                    <div className="flex items-center gap-1.5 px-2 py-1">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLOR_MAP[group.color] }}
                      />
                      <span className="text-xs font-medium truncate">{group.name}</span>
                      <span className="text-xs text-gray-400">({group.tabs.length})</span>
                    </div>
                    {group.tabs.map((tab) => (
                      <div
                        key={tab.id}
                        className="flex items-center gap-1.5 pl-6 pr-2 py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded"
                        title={`${tab.url}\n${t('clickToOpen')}`}
                        onClick={() => handleTabClick(tab.url, group.name)}
                      >
                        {tab.favIconUrl ? (
                          <img src={tab.favIconUrl} alt="" className="w-3 h-3 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <span className="w-3 h-3 rounded bg-gray-300 flex-shrink-0" />
                        )}
                        <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                          {tab.title || tab.url}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }
              const tab = item.tab;
              return (
                <div
                  key={tab.id}
                  className="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded"
                  title={`${tab.url}\n${t('clickToOpen')}`}
                  onClick={() => handleTabClick(tab.url)}
                >
                  {tab.pinned && <span className="text-[10px]">📌</span>}
                  {tab.favIconUrl ? (
                    <img src={tab.favIconUrl} alt="" className="w-3 h-3 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <span className="w-3 h-3 rounded bg-gray-300 flex-shrink-0" />
                  )}
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                    {tab.title || tab.url}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
