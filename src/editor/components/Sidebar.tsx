import type { Profile } from '../../shared/types';

interface Props {
  profiles: Profile[];
  currentProfileId: string | null;
  onSelect: (profile: Profile) => void;
}

export default function Sidebar({ profiles, currentProfileId, onSelect }: Props) {
  return (
    <div className="w-sidebar border-r bg-white dark:bg-gray-800 flex flex-col overflow-hidden">
      <div className="p-3 border-b">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          프로필 목록
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {profiles.length === 0 ? (
          <div className="text-center text-xs text-gray-400 p-4">
            저장된 프로필이 없습니다.
          </div>
        ) : (
          profiles.map((profile) => {
            const totalTabs = profile.groups.reduce((s, g) => s + g.tabs.length, 0);
            const isActive = profile.id === currentProfileId;
            return (
              <button
                key={profile.id}
                onClick={() => onSelect(profile)}
                className={`w-full text-left px-3 py-2.5 border-b transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-l-blue-600'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="text-sm font-medium truncate">{profile.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {profile.groups.length}개 그룹 · {totalTabs}개 탭
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
