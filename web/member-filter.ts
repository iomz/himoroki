import type { Member } from '../server/identity-store';

export function filterMembers(members: readonly Member[], query: string): Member[] {
  const text = query.trim().toLocaleLowerCase();
  if (!text) return [...members];
  return members.filter((member) =>
    member.name.toLocaleLowerCase().includes(text) || member.email.toLocaleLowerCase().includes(text));
}
