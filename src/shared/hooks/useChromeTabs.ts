import { useState, useEffect, useCallback } from 'react';

interface ChromeTabInfo {
  tabs: chrome.tabs.Tab[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

/**
 * 현재 창의 탭 목록을 가져오고 실시간으로 갱신하는 훅
 */
export function useChromeTabs(): ChromeTabInfo {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentWindow = await chrome.windows.getCurrent();
      const result = await chrome.tabs.query({ windowId: currentWindow.id });
      setTabs(result);
    } catch {
      setTabs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const onUpdated = () => refresh();
    const onRemoved = () => refresh();
    const onMoved = () => refresh();
    const onAttached = () => refresh();
    const onDetached = () => refresh();

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.onMoved.addListener(onMoved);
    chrome.tabs.onAttached.addListener(onAttached);
    chrome.tabs.onDetached.addListener(onDetached);

    return () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      chrome.tabs.onMoved.removeListener(onMoved);
      chrome.tabs.onAttached.removeListener(onAttached);
      chrome.tabs.onDetached.removeListener(onDetached);
    };
  }, [refresh]);

  return { tabs, isLoading, refresh };
}
