import { useEffect, useState } from 'react';
import { useProfileStore } from '../shared/store/profileStore';
import { useTabStore } from '../shared/store/tabStore';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import EditorArea from './components/EditorArea';
import PropertyPanel from './components/PropertyPanel';

export default function App() {
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const profiles = useProfileStore((s) => s.profiles);
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const currentProfile = useTabStore((s) => s.currentProfile);
  const setCurrentProfile = useTabStore((s) => s.setCurrentProfile);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // URL 파라미터에서 profileId 확인
  useEffect(() => {
    if (profiles.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const profileId = params.get('profileId');
    if (profileId && !currentProfile) {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) setCurrentProfile(profile);
    }
  }, [profiles, currentProfile, setCurrentProfile]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const handleSave = async () => {
    if (!currentProfile) return;
    try {
      await saveProfile(currentProfile);
      showToast('프로필이 저장되었습니다.');
    } catch {
      showToast('저장에 실패했습니다.', 'error');
    }
  };

  // 변경사항 감지: 초기 히스토리와 현재 상태 비교
  const hasChanges = useTabStore((s) => {
    if (!s.currentProfile || s.history.length === 0) return false;
    return JSON.stringify(s.currentProfile) !== JSON.stringify(s.history[0]);
  });

  // 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+S: 저장
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (hasChanges) handleSave();
        return;
      }

      // Ctrl+Z: 실행 취소
      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        useTabStore.getState().undo();
        return;
      }

      // Ctrl+Shift+Z 또는 Ctrl+Y: 다시 실행
      if ((ctrl && e.shiftKey && e.key === 'z') || (ctrl && e.key === 'y')) {
        e.preventDefault();
        useTabStore.getState().redo();
        return;
      }

      // Delete: 선택된 항목 삭제
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // 입력 필드에서는 무시
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
        const state = useTabStore.getState();
        if (!state.selectedItemId) return;
        e.preventDefault();
        if (state.selectedItemType === 'group') {
          state.deleteGroup(state.selectedItemId);
        } else if (state.selectedItemType === 'tab') {
          // 독립 탭인지 확인
          const isStandalone = state.currentProfile?.items.some(
            (i) => i.kind === 'tab' && i.tab.id === state.selectedItemId,
          );
          if (isStandalone) {
            state.deleteStandaloneTab(state.selectedItemId);
          } else {
            // 그룹 내 탭 찾기
            for (const item of state.currentProfile?.items ?? []) {
              if (item.kind === 'group' && item.group.tabs.some((t) => t.id === state.selectedItemId)) {
                state.deleteTab(item.group.id, state.selectedItemId);
                break;
              }
            }
          }
        }
        return;
      }

      // Escape: 선택 해제
      if (e.key === 'Escape') {
        useTabStore.getState().selectItem(null, null);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasChanges, handleSave]);

  // 미저장 변경 경고
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  // 타이틀 업데이트
  useEffect(() => {
    const base = 'Tab Manager Pro — Editor';
    document.title = hasChanges ? `* ${base}` : base;
  }, [hasChanges]);

  return (
    <div className="flex flex-col h-screen">
      <Toolbar onSave={handleSave} hasChanges={hasChanges} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          profiles={profiles}
          currentProfileId={currentProfile?.id ?? null}
          onSelect={(profile) => {
            if (hasChanges) {
              if (!window.confirm('저장하지 않은 변경사항이 있습니다. 프로필을 전환하시겠습니까?')) return;
            }
            setCurrentProfile(profile);
          }}
        />

        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          {currentProfile ? (
            <EditorArea />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              좌측에서 프로필을 선택하세요.
            </div>
          )}
        </div>

        {currentProfile && <PropertyPanel />}
      </div>

      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm text-white shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
