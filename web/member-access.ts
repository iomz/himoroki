import type { Member } from '../server/identity-store';

export function memberAccessLabel(state: Member['credentialState']): 'Setup pending' | 'Password established' {
  return state === 'established' ? 'Password established' : 'Setup pending';
}
