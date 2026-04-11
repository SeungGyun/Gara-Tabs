import { useState } from 'react';
import type { Profile } from '../../shared/types';
import { useProfileStore } from '../../shared/store/profileStore';
import { generateId } from '../../shared/utils/uuid';
import ContextMenu, { type ContextMenuItem } from '../../shared/components/ContextMenu';
import InlineEditText from '../../shared/components/InlineEditText';

interface Props {
  profiles: Profile[];
  currentProfileId: string | null;
  onSelect: (profile: Profile) => void;
}

export default function Sidebar({ profiles, currentProfileId, onSelect }: Props) {
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const deleteProfile = useProfileStore((s) => s.deleteProfile);

  const [contextMenu, setContextMenu] = useState<{
    profileId: string;
    position: { x: number; y: number };
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, profileId: string) => {
    e.preventDefault();
    setContextMenu({ profileId, position: { x: e.clientX, y: e.clientY } });
  };

  const getContextMenuItems = (profileId: string): ContextMenuItem[] => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return [];

    return [
      {
        label: '복제',
        onClick: async () => {
          const clone = structuredClone(profile);
          clone.id = generateId();
          clone.name = profile.name + ' (복사)';
          clone.createdAt = Date.now();
          clone.updatedAt = Date.now();
          for (const g of clone.groups) {
            g.id = generateId();
            for (const t of g.tabs) t.id = generateId();
          }
          await saveProfile(clone);
        },
      },
      {
        label: '삭제',
        danger: true,
        onClick: async () => {
          if (window.confirm(`"${profile.name}" 프로필을 삭제하시겠습니까?`)) {
            await deleteProfile(profileId);
          }
        },
      },
    ];
  };

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
              <div
                key={profile.id}
                onClick={() => onSelect(profile)}
                onContextMenu={(e) => handleContextMenu(e, profile.id)}
                className={`w-full text-left px-3 py-2.5 border-b transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-l-blue-600'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <InlineEditText
                  value={profile.name}
                  onCommit={(name) => updateProfile(profile.id, { name })}
                  className="text-sm font-medium truncate block"
                  inputClassName="text-sm font-medium w-full"
                />
                <div className="text-xs text-gray-500 mt-0.5">
                  {profile.groups.length}개 그룹 · {totalTabs}개 탭
                </div>
              </div>
            );
          })
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          items={getContextMenuItems(contextMenu.profileId)}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
