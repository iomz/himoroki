export const appearancePreferences = ['system', 'light', 'dark'] as const;
export type AppearancePreference = typeof appearancePreferences[number];
export type ColorScheme = Exclude<AppearancePreference, 'system'>;

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return typeof value === 'string' && appearancePreferences.some((preference) => preference === value);
}

export function resolveAppearance(preference: AppearancePreference, systemPrefersDark: boolean): ColorScheme {
  return preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;
}
