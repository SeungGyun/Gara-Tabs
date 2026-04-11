import { useState } from 'react';
import { useProfileStore } from '../../shared/store/profileStore';
import ProfileListItem from './ProfileListItem';

interface Props {
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function ProfileSection({ onShowToast }: Props) {
  const profiles = useProfileStore((s) => s.profiles);
  const isLoading = useProfileStore((s) => s.isLoading);
  const captureCurrentTabs = useProfileStore((s) => s.captureCurrentTabs);
  const deleteProfile = useProfileStore((s) => s.deleteProfile);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 검색 필터
  const filtered = profiles.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (p.name.toLowerCase().includes(q)) return true;
    return p.groups.some((g) =>
      g.tabs.some(
        (t) =>
          t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q),
      ),
    );
  });

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setIsSaving(true);
    try {
      // 동일 이름 존재 시 경고
      const existing = profiles.find((p) => p.name === saveName.trim());
      if (existing) {
        const ok = window.confirm(
          `"${saveName}" 프로필이 이미 존재합니다. 덮어쓰시겠습니까?`,
        );
        if (!ok) {
          setIsSaving(false);
          return;
        }
        await deleteProfile(existing.id);
      }
      await captureCurrentTabs(saveName.trim());
      onShowToast(`"${saveName}" 프로필이 저장되었습니다.`);
      setSaveName('');
      setShowSaveDialog(false);
    } catch {
      onShowToast('프로필 저장에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = window.confirm(`"${name}" 프로필을 삭제하시겠습니까?`);
    if (!ok) return;
    await deleteProfile(id);
    onShowToast(`"${name}" 프로필이 삭제되었습니다.`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* 저장 버튼 + 검색 */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="프로필 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input flex-1"
        />
        <button
          onClick={() => setShowSaveDialog(true)}
          className="btn-primary whitespace-nowrap"
        >
          + 저장
        </button>
      </div>

      {/* 저장 다이얼로그 */}
      {showSaveDialog && (
        <div className="card p-3 space-y-2">
          <input
            type="text"
            placeholder="프로필 이름 입력..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="input"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowSaveDialog(false); setSaveName(''); }}
              className="btn-secondary"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!saveName.trim() || isSaving}
              className="btn-primary disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* 프로필 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-8">
          {profiles.length === 0
            ? '저장된 프로필이 없습니다.'
            : '검색 결과가 없습니다.'}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((profile) => (
            <ProfileListItem
              key={profile.id}
              profile={profile}
              onDelete={() => handleDelete(profile.id, profile.name)}
              onShowToast={onShowToast}
            />
          ))}
        </div>
      )}
    </div>
  );
}
