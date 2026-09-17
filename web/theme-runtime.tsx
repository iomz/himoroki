import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { AppearancePreference, ColorScheme } from '../shared/appearance';
import type { ThemeId } from '../shared/theme';

export type ThemeRuntime = {
  appearance: AppearancePreference;
  setAppearance: Dispatch<SetStateAction<AppearancePreference>>;
  colorScheme: ColorScheme;
  setColorSchemePreview: Dispatch<SetStateAction<ColorScheme | null>>;
  themeId: ThemeId;
  setThemeId: Dispatch<SetStateAction<ThemeId>>;
};

export const ThemeRuntimeContext = createContext<ThemeRuntime | null>(null);

export function useThemeRuntime(): ThemeRuntime {
  const runtime = useContext(ThemeRuntimeContext);
  if (!runtime) throw new Error('Theme runtime is unavailable');
  return runtime;
}
