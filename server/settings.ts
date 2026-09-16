import { record, ValidationError } from './identity.js';
import { isThemeId, type ThemeId } from '../shared/theme.js';

export type Settings = { requirePhoto: boolean; displayTimezone: string; themeId: ThemeId };
export function validateSettings(value: unknown): Settings {
  const input = record(value, ['requirePhoto', 'displayTimezone', 'themeId']);
  if (typeof input.requirePhoto !== 'boolean' || typeof input.displayTimezone !== 'string'
      || !isThemeId(input.themeId)) {
    throw new ValidationError('Photo requirement, display timezone, and supported theme are required');
  }
  try { new Intl.DateTimeFormat('en', { timeZone: input.displayTimezone }); }
  catch { throw new ValidationError('Unknown display timezone'); }
  return { requirePhoto: input.requirePhoto, displayTimezone: input.displayTimezone, themeId: input.themeId };
}
export function displayInstant(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, dateStyle: 'medium', timeStyle: 'long',
  }).format(new Date(instant));
}
