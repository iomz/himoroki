import type { CSSProperties } from 'react';
import type { ThemePalette } from './types';

export function paletteVariables(palette: ThemePalette): CSSProperties {
  return {
    '--color-canvas': palette.canvas,
    '--color-surface': palette.surface,
    '--color-surface-muted': palette.surfaceMuted,
    '--color-surface-hover': palette.surfaceHover,
    '--color-border': palette.border,
    '--color-control-border': palette.controlBorder,
    '--color-text': palette.text,
    '--color-text-muted': palette.textMuted,
    '--color-chrome': palette.chrome,
    '--color-chrome-hover': palette.chromeHover,
    '--color-chrome-text': palette.chromeText,
    '--color-chrome-muted': palette.chromeMuted,
    '--color-brand-mark': palette.brandMark,
    '--color-accent': palette.accent,
    '--color-accent-soft': palette.accentSoft,
    '--color-accent-text': palette.accentText,
    '--color-link': palette.link,
    '--color-link-hover': palette.linkHover,
    '--color-focus': palette.focus,
    '--color-action': palette.action,
    '--color-action-hover': palette.actionHover,
    '--color-action-text': palette.actionText,
    '--color-selected-surface': palette.selectedSurface,
    '--color-selected-text': palette.selectedText,
    '--color-selected-indicator': palette.selectedIndicator,
    '--color-success-surface': palette.successSurface,
    '--color-success-text': palette.successText,
    '--color-danger-surface': palette.dangerSurface,
    '--color-danger-text': palette.dangerText,
  } as CSSProperties;
}
