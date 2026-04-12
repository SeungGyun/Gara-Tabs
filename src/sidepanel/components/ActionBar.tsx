import { useState } from 'react';
import { t } from '../../shared/i18n';

interface Props {
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export default function ActionBar({ onShowToast }: Props) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [isGrouping, setIsGrouping] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleCollect = async () => {
    setIsCollecting(true);
    try {
      const result = await chrome.runtime.sendMessage({ type: 'COLLECT_TABS' });
      if (result.success) {
        let msg = t('collectSuccess', result.moved);
        if (result.incognito > 0) {
          msg += t('collectIncognito', result.incognito);
        }
        onShowToast(msg);
      } else {
        onShowToast(t('collectFailed'), 'error');
      }
    } catch {
      onShowToast(t('collectError'), 'error');
    } finally {
      setIsCollecting(false);
    }
  };

  const handleGroup = async () => {
    setIsGrouping(true);
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GROUP_BY_DOMAIN' });
      if (result.success) {
        onShowToast(t('groupSuccess', result.groupCount));
      } else {
        onShowToast(t('groupFailed'), 'error');
      }
    } catch {
      onShowToast(t('groupError'), 'error');
    } finally {
      setIsGrouping(false);
    }
  };

  const handleCloseCollapsed = async () => {
    setIsClosing(true);
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CLOSE_COLLAPSED_GROUPS' });
      if (result.success) {
        if (result.closed === 0) {
          onShowToast(t('noCollapsedGroups'));
        } else {
          onShowToast(t('closedGroups', result.closed, result.tabsClosed));
        }
      } else {
        onShowToast(t('closeGroupsFailed'), 'error');
      }
    } catch {
      onShowToast(t('closeGroupsError'), 'error');
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="flex gap-1 p-3 border-b bg-white dark:bg-gray-800">
      <button
        onClick={handleCollect}
        disabled={isCollecting}
        className="btn-primary flex-1 px-1 text-xs disabled:opacity-50"
      >
        {isCollecting ? t('collecting') : t('collectTabs')}
      </button>
      <button
        onClick={handleGroup}
        disabled={isGrouping}
        className="btn-primary flex-1 px-1 text-xs disabled:opacity-50"
      >
        {isGrouping ? t('grouping') : t('domainGroup')}
      </button>
      <button
        onClick={handleCloseCollapsed}
        disabled={isClosing}
        className="btn-danger flex-1 px-1 text-xs disabled:opacity-50"
      >
        {isClosing ? t('deleting') : t('closeInactive')}
      </button>
    </div>
  );
}
