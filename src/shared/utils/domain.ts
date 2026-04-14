import type { SubdomainMode } from '../types';

const COMPOUND_TLDS = [
  'co.kr', 'co.jp', 'co.uk', 'com.au', 'com.br',
  'ne.jp', 'or.kr', 'or.jp', 'ac.kr', 'go.kr',
  'com.cn', 'net.cn', 'org.cn', 'co.in', 'co.nz',
  'co.za', 'com.mx', 'com.ar', 'com.tw',
];

/**
 * URL에서 도메인 추출.
 * subdomainMode에 따라 다르게 처리.
 */
export function extractDomain(
  url: string,
  mode: SubdomainMode,
  customRules: Record<string, string>,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname;
  if (!hostname) return null;

  // custom 규칙 매칭: path 포함 규칙 → hostname 규칙 순으로 시도
  if (Object.keys(customRules).length > 0) {
    const match = matchCustomRule(parsed, customRules);
    if (match) return match;
  }

  // split 모드: 전체 hostname 반환
  if (mode === 'split') return hostname;

  // merge 모드 (기본): TLD+1 추출
  return extractBaseDomain(hostname);
}

/**
 * 규칙 키에서 hostname과 path를 분리.
 * URL 형태("https://host/path")와 단축 형태("host/path") 모두 지원.
 */
function parseRuleKeyParts(key: string): { host: string; path: string | null } {
  // URL 형태면 URL로 파싱
  if (key.includes('://')) {
    try {
      const url = new URL(key);
      const pathSegment = url.pathname === '/' ? null : url.pathname;
      return { host: url.hostname, path: pathSegment };
    } catch {
      // 파싱 실패 시 아래로
    }
  }

  // 단축 형태: "host/path"
  const slashIdx = key.indexOf('/');
  if (slashIdx > 0) {
    return {
      host: key.substring(0, slashIdx),
      path: key.substring(slashIdx),
    };
  }

  // hostname만 있는 경우
  return { host: key, path: null };
}

/**
 * 커스텀 규칙 매칭. path 포함 규칙을 먼저 체크(더 구체적), 그 다음 hostname만 매칭.
 * 규칙 키 예: "https://nckorea.atlassian.net/jira", "host/path", "google.com"
 */
function matchCustomRule(
  parsed: URL,
  customRules: Record<string, string>,
): string | null {
  const hostname = parsed.hostname;
  const hostnameNoWww = hostname.replace(/^www\./, '');
  const baseDomain = extractBaseDomain(hostname);
  const pathname = parsed.pathname;

  // 규칙을 파싱하여 path 있는 것과 없는 것으로 분류
  const pathRules: { host: string; path: string; groupName: string }[] = [];
  const hostOnlyRules: { host: string; groupName: string }[] = [];

  for (const [key, groupName] of Object.entries(customRules)) {
    const { host, path } = parseRuleKeyParts(key);
    if (path) {
      pathRules.push({ host, path, groupName });
    } else {
      hostOnlyRules.push({ host, groupName });
    }
  }

  // 1단계: path 포함 규칙 매칭 (가장 긴 path 우선)
  pathRules.sort((a, b) => b.path.length - a.path.length);

  for (const { host, path, groupName } of pathRules) {
    const hostMatches =
      host === hostname || host === hostnameNoWww || host === baseDomain;
    if (!hostMatches) continue;

    if (pathname === path || pathname.startsWith(path + '/')) {
      return groupName;
    }
  }

  // 2단계: hostname만 있는 규칙 매칭
  for (const { host, groupName } of hostOnlyRules) {
    if (host === hostname || host === hostnameNoWww || host === baseDomain) {
      return groupName;
    }
  }

  return null;
}

/**
 * hostname에서 TLD+1(base domain)을 추출한다.
 * 예: mail.google.com → google.com
 *     blog.example.co.kr → example.co.kr
 */
export function extractBaseDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  // 복합 TLD 확인 (co.kr 등)
  const lastTwo = parts.slice(-2).join('.');
  if (COMPOUND_TLDS.includes(lastTwo)) {
    return parts.length >= 3 ? parts.slice(-3).join('.') : hostname;
  }

  return parts.slice(-2).join('.');
}

/**
 * URL이 제외 패턴에 해당하는지 확인
 */
export function isExcludedUrl(url: string, excludePatterns: string[]): boolean {
  return excludePatterns.some((pattern) => url.startsWith(pattern));
}

/**
 * 도메인에서 사람이 읽기 쉬운 이름을 추출
 * 예: google.com → Google, naver.com → Naver
 */
export function domainToDisplayName(domain: string): string {
  const base = domain.split('.')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}
