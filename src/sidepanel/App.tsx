import { useEffect, useState } from 'react';
import { useProfileStore } from '../shared/store/profileStore';
import { useSettingsStore } from '../shared/store/settingsStore';
import { t } from '../shared/i18n';
import ActionBar from './components/ActionBar';
import CurrentTabsView from './components/CurrentTabsView';
import ProfileSection from './components/ProfileSection';
import DuplicateDetector from './components/DuplicateDetector';
import SettingsPanel from './components/SettingsPanel';

type TabView = 'tabs' | 'profiles' | 'duplicates' | 'settings';

export default function App() {
  const [activeView, setActiveView] = useState<TabView>('tabs');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  // 언어 변경 시 전체 리렌더링 트리거 — 값 자체는 t()가 내부적으로 사용
  useSettingsStore((s) => s.settings.language);

  useEffect(() => {
    loadProfiles();
    loadSettings();
  }, [loadProfiles, loadSettings]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  return (
    <div className="flex flex-col h-screen w-[400px] overflow-hidden">
      <ActionBar onShowToast={showToast} />

      {/* 뷰 탭 */}
      <div className="flex border-b text-sm">
        {([
          ['tabs', t('currentTabs')],
          ['profiles', t('profiles')],
          ['duplicates', t('duplicates')],
          ['settings', t('settings')],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveView(key as TabView)}
            className={`flex-1 py-2 text-center transition-colors ${
              activeView === key
                ? 'text-blue-600 border-b-2 border-blue-600 font-medium'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 뷰 본문 */}
      <div className="flex-1 overflow-y-auto">
        {activeView === 'tabs' && <CurrentTabsView />}
        {activeView === 'profiles' && <ProfileSection onShowToast={showToast} />}
        {activeView === 'duplicates' && <DuplicateDetector onShowToast={showToast} />}
        {activeView === 'settings' && <SettingsPanel />}
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          className={`fixed bottom-4 left-4 right-4 px-4 py-2 rounded-lg text-sm text-white shadow-lg transition-opacity ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
