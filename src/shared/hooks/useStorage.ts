import { useState, useEffect, useCallback } from 'react';

/**
 * chrome.storage.local 래핑 훅
 * key에 대한 값을 읽고/쓰며, 외부 변경 시 자동 동기화
 */
export function useStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);

  // 초기 로드
  useEffect(() => {
    chrome.storage.local.get(key).then((result) => {
      if (result[key] !== undefined) {
        setValue(result[key] as T);
      }
      setIsLoading(false);
    });
  }, [key]);

  // 외부 변경 감지
  useEffect(() => {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === 'local' && changes[key]) {
        setValue(changes[key].newValue as T);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);

  const setStoredValue = useCallback(
    async (newValue: T | ((prev: T) => T)) => {
      const resolved = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(value)
        : newValue;
      await chrome.storage.local.set({ [key]: resolved });
      setValue(resolved);
    },
    [key, value],
  );

  return { value, setValue: setStoredValue, isLoading } as const;
}
