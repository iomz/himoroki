export const supportedTimezones = Object.freeze(['UTC', ...Intl.supportedValuesOf('timeZone')]);

export function filterTimezones(query: string): readonly string[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return supportedTimezones;
  return supportedTimezones.filter((zone) => zone.toLocaleLowerCase().includes(text));
}
