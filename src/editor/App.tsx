import { useEffect, useState } from 'react';
import { useProfileStore } from '../shared/store/profileStore';
import { useSettingsStore } from '../shared/store/settingsStore';
import { useTabStore } from '../shared/store/tabStore';
import { t } from '../shared/i18n';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import EditorArea from './components/EditorArea';
import PropertyPanel from './components/PropertyPanel';

export default function App() {
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  // 언어 변경 시 전체 리렌더링 트리거 — 값 자체는 t()가 내부적으로 사용
  useSettingsStore((s) => s.settings.language);
  const profiles = useProfileStore((s) => s.profiles);
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const currentProfile = useTabStore((s) => s.currentProfile);
  const setCurrentProfile = useTabStore((s) => s.setCurrentProfile);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadProfiles();
    loadSettings();
  }, [loadProfiles, loadSettings]);

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
      showToast(t('profileSavedMsg'));
    } catch {
      showToast(t('saveFailed'), 'error');
    }
  };

  const hasChanges = useTabStore((s) => {
    if (!s.currentProfile || s.history.length === 0) return false;
    return JSON.stringify(s.currentProfile) !== JSON.stringify(s.history[0]);
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (hasChanges) handleSave();
        return;
      }

      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        useTabStore.getState().undo();
        return;
      }

      if ((ctrl && e.shiftKey && e.key === 'z') || (ctrl && e.key === 'y')) {
        e.preventDefault();
        useTabStore.getState().redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
        const state = useTabStore.getState();
        if (!state.selectedItemId) return;
        e.preventDefault();
        if (state.selectedItemType === 'group') {
          state.deleteGroup(state.selectedItemId);
        } else if (state.selectedItemType === 'tab') {
          const isStandalone = state.currentProfile?.items.some(
            (i) => i.kind === 'tab' && i.tab.id === state.selectedItemId,
          );
          if (isStandalone) {
            state.deleteStandaloneTab(state.selectedItemId);
          } else {
            for (const item of state.currentProfile?.items ?? []) {
              if (item.kind === 'group' && item.group.tabs.some((tab) => tab.id === state.selectedItemId)) {
                state.deleteTab(item.group.id, state.selectedItemId);
                break;
              }
            }
          }
        }
        return;
      }

      if (e.key === 'Escape') {
        useTabStore.getState().selectItem(null, null);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasChanges, handleSave]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  useEffect(() => {
    const base = 'Gara — Tab Manager Editor';
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
              if (!window.confirm(t('unsavedChangesConfirm'))) return;
            }
            setCurrentProfile(profile);
          }}
        />

        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          {currentProfile ? (
            <EditorArea />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              {t('selectProfileHint')}
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
