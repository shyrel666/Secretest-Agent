export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeOption {
  value: ThemeMode;
  label: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: '浅色',
    description: '适合明亮环境，界面更轻盈。',
  },
  {
    value: 'dark',
    label: '深色',
    description: '适合长时间阅读，减少夜间眩光。',
  },
  {
    value: 'system',
    label: '跟随系统',
    description: '自动跟随操作系统的亮暗模式。',
  },
];

export function getThemeLabel(theme: ThemeMode): string {
  return THEME_OPTIONS.find((option) => option.value === theme)?.label ?? '跟随系统';
}
