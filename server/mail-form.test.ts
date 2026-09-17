import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mailPasswordAction } from '../web/mail-form.js';

test('mail form maps ordinary password input to explicit API actions', () => {
  assert.deepEqual(mailPasswordAction('none', 'starttls', '', false), { action: 'clear' });
  assert.deepEqual(mailPasswordAction('configured', 'starttls', '', false), { action: 'preserve' });
  assert.deepEqual(mailPasswordAction('configured', 'starttls', 'new secret', false),
    { action: 'replace', value: 'new secret' });
  assert.deepEqual(mailPasswordAction('configured', 'starttls', '', true), { action: 'clear' });
  assert.deepEqual(mailPasswordAction('configured', 'none', 'ignored', false), { action: 'clear' });
});
