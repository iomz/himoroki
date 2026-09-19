import { useSyncExternalStore } from 'react';
import { resolveAppearance, type AppearancePreference, type ColorScheme } from '../shared/appearance';
import { themeIds, type ThemeId } from '../shared/theme';

const systemQuery = '(prefers-color-scheme: dark)';
const themeHintKey = 'kannabi.instance-theme';
let mediaQuery: MediaQueryList | null = null;

function systemMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined') return null;
  mediaQuery ??= window.matchMedia(systemQuery);
  return mediaQuery;
}

export function observeSystemColorScheme(query: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>,
  listener: (scheme: ColorScheme) => void): () => void {
  const changed = () => listener(resolveAppearance('system', query.matches));
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}

function subscribe(listener: () => void): () => void {
  const query = systemMediaQuery();
  return query ? observeSystemColorScheme(query, listener) : () => {};
}

function systemPrefersDark(): boolean { return systemMediaQuery()?.matches ?? false; }

export function useResolvedAppearance(preference: AppearancePreference): ColorScheme {
  const prefersDark = useSyncExternalStore(subscribe, systemPrefersDark, () => false);
  return resolveAppearance(preference, prefersDark);
}

export function cacheInstanceTheme(themeId: ThemeId): void {
  try { window.localStorage.setItem(themeHintKey, themeId); } catch { /* Rendering hint is optional. */ }
}

export function applyDocumentTheme(themeId: ThemeId, scheme: ColorScheme): void {
  document.documentElement.dataset.theme = themeId;
  document.documentElement.dataset.colorScheme = scheme;
}

export function themeBootScript(): string {
  const ids = JSON.stringify(themeIds);
  return `(()=>{let theme='default';try{const value=localStorage.getItem('${themeHintKey}');if(${ids}.includes(value))theme=value}catch{}const scheme=matchMedia('${systemQuery}').matches?'dark':'light';document.documentElement.dataset.theme=theme;document.documentElement.dataset.colorScheme=scheme})()`;
}
