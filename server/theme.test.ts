import assert from 'node:assert/strict';
import { test } from 'node:test';
import { themeIds } from '../shared/theme.js';
import { builtInThemes } from '../web/themes/index.js';

function luminance(color: string): number {
  assert.match(color, /^#[0-9a-f]{6}$/i);
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('built-in themes provide complete paired palettes with readable semantic colors', () => {
  assert.deepEqual(builtInThemes.map(({ id }) => id), themeIds);
  const expectedTokens = Object.keys(builtInThemes[0].light).sort();
  const textPairs = [
    ['text', 'surface'], ['textMuted', 'surface'], ['chromeText', 'chrome'], ['chromeMuted', 'chrome'],
    ['accentText', 'accentSoft'], ['link', 'surface'], ['linkHover', 'surface'],
    ['actionText', 'action'], ['actionText', 'actionHover'], ['selectedText', 'selectedSurface'],
    ['successText', 'successSurface'], ['dangerText', 'dangerSurface'],
  ] as const;

  for (const theme of builtInThemes) for (const mode of ['light', 'dark'] as const) {
    const palette = theme[mode];
    assert.deepEqual(Object.keys(palette).sort(), expectedTokens, `${theme.id} ${mode} token contract`);
    for (const [foreground, background] of textPairs) {
      assert.ok(contrast(palette[foreground], palette[background]) >= 4.5,
        `${theme.id} ${mode} ${foreground}/${background} contrast`);
    }
    assert.ok(contrast(palette.focus, palette.surface) >= 3, `${theme.id} ${mode} focus contrast`);
  }
});
