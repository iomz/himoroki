import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Member } from './identity-store.js';
import { filterMembers } from '../web/member-filter.js';

const members: Member[] = [
  { key: '1', name: 'Alex Demo', email: 'evaluator@demo.invalid', isAdmin: true, credentialState: 'established', createdAt: null },
  { key: '2', name: 'Morgan Demo', email: 'collaborator@demo.invalid', isAdmin: false, credentialState: 'pending', createdAt: null },
];

test('member search matches name and email without changing loaded order', () => {
  assert.deepEqual(filterMembers(members, ''), members);
  assert.deepEqual(filterMembers(members, '  alex  ').map((member) => member.key), ['1']);
  assert.deepEqual(filterMembers(members, 'COLLABORATOR').map((member) => member.key), ['2']);
  assert.deepEqual(filterMembers(members, 'missing'), []);
});
