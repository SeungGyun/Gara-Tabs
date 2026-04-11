/**
 * URL 정규화: 비교를 위해 URL을 표준화
 */
export function normalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url.toLowerCase();
  }

  // 프로토콜 통일 (http → https)
  let protocol = parsed.protocol === 'http:' ? 'https:' : parsed.protocol;

  // www. 제거
  let hostname = parsed.hostname.replace(/^www\./, '');

  // hash 제거
  // trailing slash 제거
  let pathname = parsed.pathname.replace(/\/+$/, '');

  // 쿼리 파라미터 정렬
  const params = new URLSearchParams(parsed.search);
  const sortedParams = new URLSearchParams([...params.entries()].sort());
  const search = sortedParams.toString() ? `?${sortedParams.toString()}` : '';

  return `${protocol}//${hostname}${pathname}${search}`.toLowerCase();
}

/**
 * 중복 탭 그룹 찾기.
 * @returns Map<normalizedUrl, tab[]> (2개 이상인 것만)
 */
export function findDuplicates<T extends { url?: string; id?: number }>(
  tabs: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const tab of tabs) {
    if (!tab.url) continue;
    const key = normalizeUrl(tab.url);
    const list = groups.get(key) ?? [];
    list.push(tab);
    groups.set(key, list);
  }

  // 2개 이상인 것만 유지
  const duplicates = new Map<string, T[]>();
  for (const [key, list] of groups) {
    if (list.length >= 2) {
      duplicates.set(key, list);
    }
  }

  return duplicates;
}
