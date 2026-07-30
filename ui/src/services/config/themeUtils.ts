import type { ThemeMode } from './systemSettings';

const FONT_FAMILY_MAP: Record<string, string> = {
  default: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Segoe UI', sans-serif",
  'JetBrains Mono': "'JetBrains Mono', 'Fira Code', monospace",
  'Fira Code': "'Fira Code', 'JetBrains Mono', monospace",
  'SF Mono': "'SF Mono', 'Menlo', 'Monaco', monospace",
  Consolas: "'Consolas', 'Courier New', monospace",
};

export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

export function applyEditorFont(fontFamily: string, custom: string): void {
  const root = document.documentElement;
  if (fontFamily === 'default') {
    root.removeAttribute('data-editor-font');
    root.style.removeProperty('--editor-font-family');
  } else {
    const resolved = fontFamily === 'custom' ? custom : (FONT_FAMILY_MAP[fontFamily] || fontFamily);
    root.setAttribute('data-editor-font', fontFamily);
    root.style.setProperty('--editor-font-family', resolved);
  }
}

export function getFontFamilyOptions(): Array<{ value: string; label: string }> {
  return [
    { value: 'default', label: '系统默认' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono' },
    { value: 'Fira Code', label: 'Fira Code' },
    { value: 'SF Mono', label: 'SF Mono' },
    { value: 'Consolas', label: 'Consolas' },
    { value: 'custom', label: '自定义…' },
  ];
}
