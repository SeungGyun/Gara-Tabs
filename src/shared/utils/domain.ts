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

  // custom 규칙 매칭: hostname 그대로, www. 제거, base domain 순서로 시도
  if (Object.keys(customRules).length > 0) {
    const hostnameNoWww = hostname.replace(/^www\./, '');
    const baseDomain = extractBaseDomain(hostname);
    const match =
      customRules[hostname] ??
      customRules[hostnameNoWww] ??
      customRules[baseDomain];
    if (match) return match;
  }

  // split 모드: 전체 hostname 반환
  if (mode === 'split') return hostname;

  // merge 모드 (기본): TLD+1 추출
  return extractBaseDomain(hostname);
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
