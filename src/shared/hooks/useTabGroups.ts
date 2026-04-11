import { useState, useEffect, useCallback } from 'react';

interface TabGroupInfo {
  groups: chrome.tabGroups.TabGroup[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * 현재 창의 탭 그룹 목록을 가져오고 갱신하는 훅
 */
export function useTabGroups(): TabGroupInfo {
  const [groups, setGroups] = useState<chrome.tabGroups.TabGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentWindow = await chrome.windows.getCurrent();
      const result = await chrome.tabGroups.query({ windowId: currentWindow.id });
      setGroups(result);
    } catch {
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // 탭 그룹 변경 감지
    const onUpdated = () => refresh();
    chrome.tabGroups.onUpdated.addListener(onUpdated);

    // 탭 이동/생성/삭제 시에도 그룹이 변경될 수 있음
    const tabChange = () => refresh();
    chrome.tabs.onUpdated.addListener(tabChange);
    chrome.tabs.onRemoved.addListener(tabChange);

    return () => {
      chrome.tabGroups.onUpdated.removeListener(onUpdated);
      chrome.tabs.onUpdated.removeListener(tabChange);
      chrome.tabs.onRemoved.removeListener(tabChange);
    };
  }, [refresh]);

  return { groups, isLoading, refresh };
}
