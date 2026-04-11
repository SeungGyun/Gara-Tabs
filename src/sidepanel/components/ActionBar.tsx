import { useState } from 'react';

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
        let msg = `${result.moved}개 탭을 모았습니다.`;
        if (result.incognito > 0) {
          msg += ` (시크릿 ${result.incognito}개는 이동 불가)`;
        }
        onShowToast(msg);
      } else {
        onShowToast('탭 모으기에 실패했습니다.', 'error');
      }
    } catch {
      onShowToast('탭 모으기 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsCollecting(false);
    }
  };

  const handleGroup = async () => {
    setIsGrouping(true);
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GROUP_BY_DOMAIN' });
      if (result.success) {
        onShowToast(`${result.groupCount}개 도메인 그룹을 생성했습니다.`);
      } else {
        onShowToast('그룹화에 실패했습니다.', 'error');
      }
    } catch {
      onShowToast('그룹화 중 오류가 발생했습니다.', 'error');
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
          onShowToast('접힌 그룹이 없습니다.');
        } else {
          onShowToast(`${result.closed}개 그룹 (${result.tabsClosed}개 탭) 삭제됨`);
        }
      } else {
        onShowToast('비활성 그룹 삭제에 실패했습니다.', 'error');
      }
    } catch {
      onShowToast('비활성 그룹 삭제 중 오류가 발생했습니다.', 'error');
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
        {isCollecting ? '모으는 중...' : '탭 모으기'}
      </button>
      <button
        onClick={handleGroup}
        disabled={isGrouping}
        className="btn-primary flex-1 px-1 text-xs disabled:opacity-50"
      >
        {isGrouping ? '그룹화 중...' : '도메인 그룹'}
      </button>
      <button
        onClick={handleCloseCollapsed}
        disabled={isClosing}
        className="btn-danger flex-1 px-1 text-xs disabled:opacity-50"
      >
        {isClosing ? '삭제 중...' : '비활성 삭제'}
      </button>
    </div>
  );
}
