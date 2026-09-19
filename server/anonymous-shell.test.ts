import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anonymousShellHandle, isAnonymousShellHandle } from '../web/anonymous-shell.js';

test('anonymous shell selection requires explicit route metadata', () => {
  assert.equal(isAnonymousShellHandle(anonymousShellHandle), true);
  assert.equal(isAnonymousShellHandle({ shell: 'authenticated' }), false);
  assert.equal(isAnonymousShellHandle(null), false);
  assert.equal(isAnonymousShellHandle('/signin'), false);
});
