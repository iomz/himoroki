import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mailer, MailMessage } from './mail.js';
import { MailDeliveryError } from './mail.js';
import { hashPasswordResetIdentifier, invalidateOutstandingResetTokens, passwordResetMessage, passwordResetPrefix,
  passwordResetURL, queuePasswordResetEmail } from './password-recovery.js';
import { isInvalidResetError, resetTokenFromHash } from '../web/password-recovery.js';

test('password-reset identifiers retain purpose without retaining token', async () => {
  const identifier = passwordResetPrefix + 'secret-token';
  const stored = await hashPasswordResetIdentifier(identifier);
  assert.ok(stored.startsWith(passwordResetPrefix));
  assert.ok(!stored.includes('secret-token'));
  assert.equal(stored, await hashPasswordResetIdentifier(identifier));
  assert.notEqual(stored, await hashPasswordResetIdentifier(passwordResetPrefix + 'another-token'));
  await assert.rejects(() => hashPasswordResetIdentifier('email-verification:secret'));
});

test('reset links use canonical origin and keep token in fragment', () => {
  const url = passwordResetURL('https://kannabi.example/base?ignored=yes', 'a/b?c');
  assert.equal(url, 'https://kannabi.example/reset-password#token=a%2Fb%3Fc');
  assert.equal(resetTokenFromHash(new URL(url).hash), 'a/b?c');
  assert.equal(resetTokenFromHash('#other=value'), null);
  const message = passwordResetMessage('https://kannabi.example', 'person@example.com', 'token');
  assert.equal(message.to, 'person@example.com');
  assert.match(message.subject, /Reset your Kannabi password/);
  assert.match(message.text, /Open this link to choose a new password:\nhttps:\/\/kannabi\.example\/reset-password#token=token\n/);
  assert.match(message.text, /expires in one hour and can be used only once/);
  assert.match(message.text, /ignore this email/);
  assert.match(message.text, /password will remain unchanged/);
  const setup = passwordResetMessage('https://kannabi.example', 'new@example.com', 'setup-token', 'setup');
  assert.equal(setup.subject, 'Set up your Kannabi account');
  assert.match(setup.text, /An account has been created for you on Kannabi/);
  assert.match(setup.text, /set your password and finish setting up your account/);
  assert.match(setup.text, /expires in one hour and can be used only once/);
  assert.match(setup.text, /weren't expecting this account/);
  assert.ok(!setup.text.includes('request to reset'));
});

test('mail dispatch is asynchronous and reports only safe failure category', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let received: MailMessage | undefined;
  const mailer: Mailer = { async send(message) { received = message; await pending;
    throw new MailDeliveryError('connection', 'private provider detail'); } };
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...values: unknown[]) => { logs.push(values); };
  try {
    queuePasswordResetEmail(mailer, 'https://kannabi.example', 'person@example.com', 'secret-token');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(received?.to, 'person@example.com');
    assert.equal(logs.length, 0);
    release();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(logs, [['Password recovery mail delivery failed', { category: 'connection' }]]);
    assert.ok(!JSON.stringify(logs).includes('secret-token'));
    assert.ok(!JSON.stringify(logs).includes('private provider detail'));
  } finally { console.error = original; }
});

test('reset errors expose one invalid-link state', () => {
  assert.equal(isInvalidResetError({ code: 'INVALID_TOKEN' }), true);
  assert.equal(isInvalidResetError({ message: 'User not found' }), true);
  assert.equal(isInvalidResetError({ code: 'PASSWORD_TOO_SHORT' }), false);
});

test('sibling cleanup failure is swallowed without exposing persistence details', async () => {
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...values: unknown[]) => { logs.push(values); };
  try {
    await invalidateOutstandingResetTokens({
      async deleteOutstandingResetTokens() { throw new Error('private database detail'); },
    }, 'user-id');
    assert.deepEqual(logs, [['Outstanding password-reset tokens could not be invalidated']]);
    assert.ok(!JSON.stringify(logs).includes('private database detail'));
  } finally { console.error = original; }
});
