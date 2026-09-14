import { record, ValidationError } from './identity.js';

export type Settings = { requirePhoto: boolean; displayTimezone: string };
export function validateSettings(value: unknown): Settings {
  const input = record(value, ['requirePhoto', 'displayTimezone']);
  if (typeof input.requirePhoto !== 'boolean' || typeof input.displayTimezone !== 'string') {
    throw new ValidationError('Photo requirement and display timezone are required');
  }
  try { new Intl.DateTimeFormat('en', { timeZone: input.displayTimezone }); }
  catch { throw new ValidationError('Unknown display timezone'); }
  return { requirePhoto: input.requirePhoto, displayTimezone: input.displayTimezone };
}
export function displayInstant(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, dateStyle: 'medium', timeStyle: 'long',
  }).format(new Date(instant));
}
