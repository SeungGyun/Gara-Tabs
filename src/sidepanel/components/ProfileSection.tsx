import { useState } from 'react';
import { useProfileStore } from '../../shared/store/profileStore';
import { t } from '../../shared/i18n';
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

  const filtered = profiles.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (p.name.toLowerCase().includes(q)) return true;
    return p.items.some((item) => {
      const tabs = item.kind === 'group'
        ? [item.group.name, ...item.group.tabs.map((t) => `${t.title} ${t.url}`)]
        : [`${item.tab.title} ${item.tab.url}`];
      return tabs.some((s) => s.toLowerCase().includes(q));
    });
  });

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setIsSaving(true);
    try {
      const existing = profiles.find((p) => p.name === saveName.trim());
      if (existing) {
        const ok = window.confirm(t('profileExistsConfirm', saveName));
        if (!ok) {
          setIsSaving(false);
          return;
        }
        await deleteProfile(existing.id);
      }
      await captureCurrentTabs(saveName.trim());
      onShowToast(t('profileSaved', saveName));
      setSaveName('');
      setShowSaveDialog(false);
    } catch {
      onShowToast(t('profileSaveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportAll = () => {
    const json = JSON.stringify(profiles, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-manager-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast(t('profilesExported', profiles.length));
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        const arr = Array.isArray(imported) ? imported : [imported];
        let count = 0;
        for (const p of arr) {
          if (p && p.name && (p.items || p.groups)) {
            await useProfileStore.getState().saveProfile({
              ...p,
              id: p.id ?? crypto.randomUUID(),
              createdAt: p.createdAt ?? Date.now(),
              updatedAt: Date.now(),
            });
            count++;
          }
        }
        onShowToast(t('profilesImported', count));
      } catch {
        onShowToast(t('invalidJsonFile'), 'error');
      }
    };
    input.click();
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = window.confirm(t('profileDeleteConfirm', name));
    if (!ok) return;
    await deleteProfile(id);
    onShowToast(t('profileDeleted', name));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-400">
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex gap-1">
        <button
          onClick={() => setShowSaveDialog(true)}
          className="btn-primary flex-1 text-xs"
        >
          {t('createNew')}
        </button>
        <button onClick={handleExportAll} disabled={profiles.length === 0} className="btn-secondary flex-1 text-xs disabled:opacity-50">
          {t('export')}
        </button>
        <button onClick={handleImport} className="btn-secondary flex-1 text-xs">
          {t('import')}
        </button>
      </div>

      {showSaveDialog && (
        <div className="card p-3 space-y-2">
          <input
            type="text"
            placeholder={t('profileNamePlaceholder')}
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
              {t('cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={!saveName.trim() || isSaving}
              className="btn-primary disabled:opacity-50"
            >
              {isSaving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}

      {profiles.length > 0 && (
        <input
          type="text"
          placeholder={t('searchProfiles')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input"
        />
      )}

      {filtered.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-8">
          {profiles.length === 0
            ? t('noProfiles')
            : t('noSearchResults')}
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
