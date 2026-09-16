import { themeIds, type ThemeId } from '../../shared/theme';
import { christmasTheme } from './christmas';
import { classicTheme } from './classic';
import { defaultTheme } from './default';
import { fireRedTheme } from './fire-red';
import { hufflepuffTheme } from './hufflepuff';
import { jadeGreenTheme } from './jade-green';
import { monoBlueTheme } from './mono-blue';
import { raycastTheme } from './raycast';
import type { ThemeDefinition } from './types';

export const themesById: Record<ThemeId, ThemeDefinition> = {
  default: defaultTheme,
  'mono-blue': monoBlueTheme,
  hufflepuff: hufflepuffTheme,
  'fire-red': fireRedTheme,
  'jade-green': jadeGreenTheme,
  classic: classicTheme,
  christmas: christmasTheme,
  raycast: raycastTheme,
};

export const builtInThemes = themeIds.map((id) => themesById[id]);
export function themeById(id: ThemeId): ThemeDefinition { return themesById[id]; }
