export const themeIds = [
  'default', 'mono-blue', 'hufflepuff', 'fire-red',
  'jade-green', 'classic', 'christmas', 'raycast',
] as const;

export type ThemeId = typeof themeIds[number];
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themeIds.some((id) => id === value);
}
