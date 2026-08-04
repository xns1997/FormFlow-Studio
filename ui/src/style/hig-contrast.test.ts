import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const css = readFileSync(resolve('ui/src/style/variables.css'), 'utf8');

function parseTokens(source: string) {
  const tokens: Record<string, string> = {};
  for (const match of source.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))\s*;/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

function hexRgb(hex: string) {
  const value = hex.replace('#', '');
  if (value.length === 3) return [value[0] + value[0], value[1] + value[1], value[2] + value[2]].map((part) => parseInt(part, 16));
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
}

function luminance(hex: string) {
  const channels = hexRgb(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

const light = parseTokens(css.match(/:root\s*\{([^}]*)\}/s)?.[1] || '');
const dark = parseTokens(css.match(/@media \(prefers-color-scheme: dark\)\s*\{([^}]*)\}/s)?.[1] || '');

test('HIG tokens define both light and dark palettes', () => {
  assert.ok(light['text'] && light['panel'] && light['bg']);
  assert.ok(dark['text'] && dark['panel'] && dark['bg']);
});

test('body text contrast meets 4.5:1 in light and dark appearances', () => {
  for (const [name, palette] of [['light', light], ['dark', dark]] as const) {
    assert.ok(contrast(palette['text'], palette['panel']) >= 4.5, `${name}: text on panel ${contrast(palette['text'], palette['panel']).toFixed(2)}`);
    assert.ok(contrast(palette['text'], palette['bg']) >= 4.5, `${name}: text on bg ${contrast(palette['text'], palette['bg']).toFixed(2)}`);
    assert.ok(contrast(palette['text-secondary'], palette['panel']) >= 4.5, `${name}: secondary on panel ${contrast(palette['text-secondary'], palette['panel']).toFixed(2)}`);
  }
});

test('accent and danger keep at least 3:1 against panels (icon/graphic level)', () => {
  for (const [name, palette] of [['light', light], ['dark', dark]] as const) {
    assert.ok(contrast(palette['accent'], palette['panel']) >= 3, `${name}: accent on panel ${contrast(palette['accent'], palette['panel']).toFixed(2)}`);
    assert.ok(contrast(palette['danger'], palette['panel']) >= 3, `${name}: danger on panel ${contrast(palette['danger'], palette['panel']).toFixed(2)}`);
  }
});

test('desktop base type is 13pt and reduced-motion is honored', () => {
  assert.match(css, /font-size:\s*13px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
