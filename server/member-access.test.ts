import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memberAccessLabel } from '../web/member-access.js';

test('member access labels distinguish pending setup from established passwords', () => {
  assert.equal(memberAccessLabel('pending'), 'Setup pending');
  assert.equal(memberAccessLabel('established'), 'Password established');
});
