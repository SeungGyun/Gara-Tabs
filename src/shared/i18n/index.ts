import ko, { type TranslationKey, type TranslationKeys } from './locales/ko';
import en from './locales/en';
import ja from './locales/ja';
import zh_CN from './locales/zh_CN';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';
import pt_BR from './locales/pt_BR';

export type { TranslationKey };

const locales: Record<string, TranslationKeys> = {
  ko,
  en,
  ja,
  zh: zh_CN,
  'zh-CN': zh_CN,
  'zh-TW': zh_CN,
  es,
  fr,
  de,
  pt: pt_BR,
  'pt-BR': pt_BR,
};

/** 사용자가 선택 가능한 언어 목록 */
export const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: 'Auto' },
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português (BR)' },
] as const;

// ── 사용자 설정 언어 (settingsStore에서 주입) ──

let userLanguage: string = 'auto';

/**
 * settingsStore에서 언어 설정이 변경될 때 호출합니다.
 * 캐시를 무효화하여 다음 t() 호출에 반영됩니다.
 */
export function setUserLanguage(lang: string): void {
  userLanguage = lang;
  // 캐시 무효화
  cachedLocale = null;
  cachedMessages = null;
}

// ── 로케일 감지 ──

function detectLocale(): string {
  // 1순위: 사용자 설정
  if (userLanguage && userLanguage !== 'auto') {
    return userLanguage;
  }
  // 2순위: Chrome UI 언어
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
      return chrome.i18n.getUILanguage();
    }
  } catch {
    // fallback
  }
  return navigator.language ?? 'en';
}

function resolveMessages(locale: string): TranslationKeys {
  if (locales[locale]) return locales[locale];
  const lang = locale.split('-')[0];
  if (locales[lang]) return locales[lang];
  return en;
}

let cachedLocale: string | null = null;
let cachedMessages: TranslationKeys | null = null;

function getMessages(): TranslationKeys {
  const locale = detectLocale();
  if (locale !== cachedLocale) {
    cachedLocale = locale;
    cachedMessages = resolveMessages(locale);
  }
  return cachedMessages!;
}

/**
 * 번역 함수. 키에 해당하는 번역 문자열을 반환합니다.
 * `{0}`, `{1}` 등의 플레이스홀더를 인자로 대체합니다.
 *
 * @example
 * t('collectSuccess', 5)  // "5개 탭을 모았습니다." (ko)
 * t('groupsAndTabs', 3, 12)  // "3개 그룹 · 12개 탭" (ko)
 */
export function t(key: TranslationKey, ...args: (string | number)[]): string {
  const messages = getMessages();
  let msg: string = messages[key] ?? ko[key] ?? key;
  for (let i = 0; i < args.length; i++) {
    msg = msg.replace(`{${i}}`, String(args[i]));
  }
  return msg;
}

/**
 * 현재 감지된 로케일 코드를 반환합니다. (e.g. "ko", "en", "ja")
 */
export function getCurrentLocale(): string {
  return detectLocale();
}

/**
 * 현재 로케일의 날짜 포맷 로케일 문자열을 반환합니다.
 * toLocaleDateString / toLocaleString 등에 사용합니다.
 */
export function getDateLocale(): string {
  return detectLocale();
}
