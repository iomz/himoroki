import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passwordChangeInput } from '../web/password-change.js';

test('password confirmation is checked before creating a Better Auth request', () => {
  const mismatch = new FormData();
  mismatch.set('currentPassword', 'current-password');
  mismatch.set('newPassword', 'new-password-12345');
  mismatch.set('confirmation', 'different-password-12345');
  assert.deepEqual(passwordChangeInput(mismatch), { body: null, error: 'Passwords do not match.' });

  const matching = new FormData();
  matching.set('currentPassword', 'current-password');
  matching.set('newPassword', 'new-password-12345');
  matching.set('confirmation', 'new-password-12345');
  assert.deepEqual(passwordChangeInput(matching), { body: {
    currentPassword: 'current-password', newPassword: 'new-password-12345', revokeOtherSessions: true,
  }, error: null });
});
