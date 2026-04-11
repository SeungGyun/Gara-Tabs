import { TAB_GROUP_COLORS, type ChromeTabGroupColor } from '../types';

/**
 * 색상 배열에서 순환 배정.
 * usedColors를 받아 가능하면 중복 피하고, 불가능하면 순환.
 */
export function assignColor(index: number): ChromeTabGroupColor {
  return TAB_GROUP_COLORS[index % TAB_GROUP_COLORS.length];
}

/**
 * Chrome 탭 그룹 색상 → Tailwind / CSS HEX 매핑
 */
export const COLOR_MAP: Record<ChromeTabGroupColor, string> = {
  grey: '#5f6368',
  blue: '#1a73e8',
  red: '#d93025',
  yellow: '#f9ab00',
  green: '#188038',
  pink: '#d01884',
  purple: '#a142f4',
  cyan: '#007b83',
  orange: '#e8710a',
};

export const COLOR_MAP_LIGHT: Record<ChromeTabGroupColor, string> = {
  grey: '#e8eaed',
  blue: '#d2e3fc',
  red: '#fad2cf',
  yellow: '#feefc3',
  green: '#ceead6',
  pink: '#fad2e8',
  purple: '#e8d0fe',
  cyan: '#c4eee9',
  orange: '#fedfc8',
};
