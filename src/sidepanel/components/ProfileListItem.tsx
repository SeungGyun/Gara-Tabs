import { useState } from 'react';
import type { Profile, ProfileSnapshot, LoadProfileOption } from '../../shared/types';
import { useProfileStore } from '../../shared/store/profileStore';
import { COLOR_MAP } from '../../shared/utils/colors';
import InlineEditText from '../../shared/components/InlineEditText';
import { generateId } from '../../shared/utils/uuid';

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

  const totalTabs = profile.groups.reduce((sum, g) => sum + g.tabs.length, 0);

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
        onShowToast(`"${profile.name}" 프로필을 불러왔습니다.`);
      } else {
        onShowToast('프로필 불러오기에 실패했습니다.', 'error');
      }
    } catch {
      onShowToast('프로필 불러오기 중 오류가 발생했습니다.', 'error');
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
    onShowToast(`프로필 이름이 "${newName}"으로 변경되었습니다.`);
  };

  const handleDuplicate = async () => {
    const clone = structuredClone(profile);
    clone.id = generateId();
    clone.name = profile.name + ' (복사)';
    clone.createdAt = Date.now();
    clone.updatedAt = Date.now();
    // 그룹/탭 ID도 새로 생성
    for (const g of clone.groups) {
      g.id = generateId();
      for (const t of g.tabs) t.id = generateId();
    }
    await saveProfile(clone);
    onShowToast(`"${clone.name}" 프로필이 복제되었습니다.`);
  };

  const handleRefreshFromTabs = async () => {
    if (!window.confirm('현재 브라우저 탭으로 프로필을 덮어쓰시겠습니까?\n(이전 버전은 히스토리에 보관됩니다)')) return;
    setIsRefreshing(true);
    try {
      await refreshFromTabs(profile.id);
      onShowToast(`"${profile.name}" 프로필이 현재 탭으로 갱신되었습니다.`);
    } catch {
      onShowToast('갱신에 실패했습니다.', 'error');
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
    if (!window.confirm('이 버전으로 복원하시겠습니까?\n(현재 버전은 히스토리에 보관됩니다)')) return;
    await restoreFromHistory(profile.id, timestamp);
    onShowToast('이전 버전으로 복원되었습니다.');
    setShowHistory(false);
  };

  const handleTabClick = (url: string) => {
    if (url) chrome.tabs.create({ url, active: false });
  };

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
            {profile.groups.length}개 그룹 · {totalTabs}개 탭
          </div>
        </div>
        <div className="text-xs text-gray-400">
          {new Date(profile.createdAt).toLocaleDateString('ko-KR')}
        </div>
      </div>

      {/* 펼친 상태 */}
      {expanded && (
        <div className="border-t">
          {/* 액션 버튼 */}
          <div className="flex gap-1 p-2 border-b flex-wrap">
            <button
              onClick={() => setShowLoadDialog(true)}
              disabled={isLoading}
              className="btn-primary flex-1 text-xs disabled:opacity-50"
            >
              {isLoading ? '불러오는 중...' : '불러오기'}
            </button>
            <button onClick={handleOpenEditor} className="btn-secondary flex-1 text-xs">
              에디터
            </button>
            <button onClick={handleDuplicate} className="btn-secondary flex-1 text-xs">
              복제
            </button>
            <button
              onClick={handleRefreshFromTabs}
              disabled={isRefreshing}
              className="btn-secondary flex-1 text-xs disabled:opacity-50"
              title="현재 브라우저 탭으로 프로필 덮어쓰기"
            >
              {isRefreshing ? '갱신 중...' : '현재 탭 반영'}
            </button>
            <button
              onClick={handleShowHistory}
              className={`btn-secondary flex-1 text-xs ${showHistory ? 'ring-1 ring-blue-400' : ''}`}
            >
              히스토리
            </button>
            <button onClick={onDelete} className="btn-danger flex-1 text-xs">
              삭제
            </button>
          </div>

          {/* 불러오기 다이얼로그 */}
          {showLoadDialog && (
            <div className="p-3 border-b bg-blue-50 dark:bg-blue-900/20 space-y-2">
              <p className="text-xs font-medium">기존 탭 처리 방법:</p>
              <div className="space-y-1">
                <button
                  onClick={() => handleLoad('close_existing')}
                  className="w-full text-left text-xs p-2 rounded hover:bg-blue-100 dark:hover:bg-blue-800/30"
                >
                  기존 탭 모두 닫기
                </button>
                <button
                  onClick={() => handleLoad('keep_as_group')}
                  className="w-full text-left text-xs p-2 rounded hover:bg-blue-100 dark:hover:bg-blue-800/30"
                >
                  기존 탭 유지 (그룹으로 묶기)
                </button>
                <button
                  onClick={() => handleLoad('cancel')}
                  className="w-full text-left text-xs p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* 히스토리 */}
          {showHistory && (
            <div className="p-2 border-b bg-gray-50 dark:bg-gray-800/50 space-y-1">
              <p className="text-xs font-medium px-1">변경 히스토리 (최대 10개)</p>
              {historyList.length === 0 ? (
                <p className="text-xs text-gray-400 px-1 py-2">히스토리가 없습니다.</p>
              ) : (
                historyList.map((snap) => {
                  const tabCount = snap.profile.groups.reduce((s, g) => s + g.tabs.length, 0);
                  return (
                    <div
                      key={snap.timestamp}
                      className="flex items-center justify-between text-xs bg-white dark:bg-gray-700 rounded px-2 py-1.5"
                    >
                      <div>
                        <span className="text-gray-600 dark:text-gray-300">
                          {new Date(snap.timestamp).toLocaleString('ko-KR', {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        <span className="text-gray-400 ml-1.5">
                          {snap.profile.groups.length}그룹 · {tabCount}탭
                        </span>
                      </div>
                      <button
                        onClick={() => handleRestore(snap.timestamp)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                      >
                        복원
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 그룹/탭 트리 */}
          <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
            {profile.groups.map((group) => (
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
                    title={`${tab.url}\n클릭하여 새 탭에서 열기`}
                    onClick={() => handleTabClick(tab.url)}
                  >
                    {tab.favIconUrl ? (
                      <img
                        src={tab.favIconUrl}
                        alt=""
                        className="w-3 h-3 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="w-3 h-3 rounded bg-gray-300 flex-shrink-0" />
                    )}
                    <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                      {tab.title || tab.url}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
