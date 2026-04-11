import { useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { extractDomain, isExcludedUrl, domainToDisplayName } from '../utils/domain';
import { assignColor } from '../utils/colors';

/**
 * 도메인별 그룹화 로직을 제공하는 훅.
 * Background로 메시지를 보내 실제 Chrome API 호출을 위임.
 */
export function useDomainGrouping() {
  const settings = useSettingsStore((s) => s.settings);

  const groupByDomain = useCallback(async () => {
    const response = await chrome.runtime.sendMessage({
      type: 'GROUP_BY_DOMAIN',
      settings,
    });
    return response;
  }, [settings]);

  /**
   * 탭 배열을 도메인별로 분류 (프리뷰 용도, Chrome API 호출 없음)
   */
  const classifyTabs = useCallback(
    (tabs: chrome.tabs.Tab[]) => {
      const domainMap = new Map<string, chrome.tabs.Tab[]>();
      const excluded: chrome.tabs.Tab[] = [];

      for (const tab of tabs) {
        if (!tab.url || isExcludedUrl(tab.url, settings.excludePatterns)) {
          excluded.push(tab);
          continue;
        }
        const domain = extractDomain(
          tab.url,
          settings.subdomainMode,
          settings.customDomainRules,
        );
        if (!domain) {
          excluded.push(tab);
          continue;
        }
        const list = domainMap.get(domain) ?? [];
        list.push(tab);
        domainMap.set(domain, list);
      }

      // 이름/색상 부여
      let colorIndex = 0;
      const groups = [...domainMap.entries()].map(([domain, domainTabs]) => ({
        domain,
        displayName: domainToDisplayName(domain),
        color: assignColor(colorIndex++),
        tabs: domainTabs,
      }));

      return { groups, excluded };
    },
    [settings],
  );

  return { groupByDomain, classifyTabs };
}
