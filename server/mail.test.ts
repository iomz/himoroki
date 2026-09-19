import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import type { Transporter } from 'nodemailer';
import { MailDeliveryError, MailRevisionConflictError, MailService, mailbox, validateMailUpdate,
  type MailConfigurationStore, type MailVerificationStatus, type PersistedMailSettings,
  type StoredMailConfiguration } from './mail.js';
import { MasterKeyManager } from './secrets.js';

const disabled = (): StoredMailConfiguration => ({ revision: 0, enabled: false, transport: 'smtp',
  smtpHost: null, smtpPort: null, smtpSecurity: null, smtpUsername: null, smtpPasswordEnvelope: null,
  senderAddress: null, senderName: null, verificationStatus: 'not-verified', verificationObservedAt: null });

class MemoryMailStore implements MailConfigurationStore {
  configuration = disabled();
  async readMailConfiguration() { return structuredClone(this.configuration); }
  async effectiveMailConfiguration() { return structuredClone(this.configuration); }
  async replaceMailConfiguration(_actor: string, revision: number, next: PersistedMailSettings) {
    if (revision !== this.configuration.revision) throw new MailRevisionConflictError();
    this.configuration = { ...structuredClone(next), revision: revision + 1,
      verificationStatus: 'not-verified', verificationObservedAt: null };
    return structuredClone(this.configuration);
  }
  async recordMailVerification(revision: number, status: MailVerificationStatus, observedAt: string) {
    if (revision !== this.configuration.revision) return null;
    this.configuration = { ...this.configuration, verificationStatus: status, verificationObservedAt: observedAt };
    return structuredClone(this.configuration);
  }
  async resetEncryptedSecrets(_actor: string, revision: number) {
    if (revision !== this.configuration.revision) throw new MailRevisionConflictError();
    this.configuration = { ...this.configuration, revision: revision + 1, enabled: false,
      smtpUsername: null, smtpPasswordEnvelope: null,
      verificationStatus: 'not-verified', verificationObservedAt: null };
    return structuredClone(this.configuration);
  }
}

async function keys() {
  return MasterKeyManager.open(false, { KANNABI_SECRET_KEY: randomBytes(32).toString('base64url') });
}

function complete(revision = 0) {
  return { revision, enabled: true, transport: 'smtp', smtpHost: 'smtp.example.com', smtpPort: 587,
    smtpSecurity: 'starttls', smtpUsername: 'mailer', senderAddress: 'noreply@example.com',
    senderName: 'Kannabi', password: { action: 'replace', value: 'mail-password' } } as const;
}

test('mail configuration validation is strict and normalizes addresses', () => {
  assert.equal(mailbox('Person+tag@EXAMPLE.COM'), 'Person+tag@example.com');
  for (const address of ['', 'person', '@example.com', 'person@@example.com', '.person@example.com',
    'person..name@example.com', 'person@example..com', 'person\n@example.com']) {
    assert.throws(() => mailbox(address));
  }
  assert.throws(() => validateMailUpdate({ ...complete(), extra: true }), /Unsupported field/);
  assert.throws(() => validateMailUpdate({ ...complete(), smtpPort: 70000 }), /SMTP port/);
  assert.throws(() => validateMailUpdate({ ...complete(), smtpSecurity: 'automatic' }), /security mode/);
  assert.throws(() => validateMailUpdate({ ...complete(), password: { action: 'replace', value: 'x', extra: true } }), /Unsupported field/);
  assert.equal((validateMailUpdate({ ...complete(), password: { action: 'replace', value: ' spaced secret ' } })
    .password as { value: string }).value, ' spaced secret ');
});

test('password replace, preserve and clear stay encrypted and never enter public configuration', async () => {
  const store = new MemoryMailStore();
  const verified = { verify: async () => true, close() {} } as unknown as Transporter;
  const service = new MailService(store, await keys(), () => verified);
  const saved = await service.update('admin', complete());
  assert.equal(saved.passwordState, 'configured');
  assert.equal(saved.verificationStatus, 'verified');
  assert.ok(saved.verificationObservedAt);
  assert.ok(!('smtpPasswordEnvelope' in saved));
  assert.match(store.configuration.smtpPasswordEnvelope!, /^secret:v1:/);
  assert.ok(!store.configuration.smtpPasswordEnvelope!.includes('mail-password'));
  const envelope = store.configuration.smtpPasswordEnvelope;
  await service.update('admin', { ...complete(1), password: { action: 'preserve' } });
  assert.equal(store.configuration.smtpPasswordEnvelope, envelope);
  const cleared = await service.update('admin', { ...complete(2), enabled: false, smtpUsername: '',
    password: { action: 'clear' } });
  assert.equal(cleared.passwordState, 'none');
  assert.equal(store.configuration.smtpPasswordEnvelope, null);
});

test('enabled configuration requires complete fields and secure authentication', async () => {
  const service = new MailService(new MemoryMailStore(), await keys());
  await assert.rejects(service.update('admin', { ...complete(), smtpHost: '' }), /complete SMTP/);
  await assert.rejects(service.update('admin', { ...complete(), smtpSecurity: 'none' }), /cannot use authentication/);
  await assert.rejects(service.update('admin', { ...complete(), smtpUsername: '', password: { action: 'replace', value: 'secret' } }),
    /username and password/);
});

test('configuration reads and disabled saves do not probe SMTP', async () => {
  const store = new MemoryMailStore();
  let transports = 0;
  const service = new MailService(store, await keys(), () => {
    transports++;
    return { verify: async () => true, close() {} } as unknown as Transporter;
  });
  assert.equal((await service.configuration('admin')).verificationStatus, 'not-verified');
  await service.update('admin', { ...complete(), enabled: false });
  assert.equal(transports, 0);
  assert.equal(store.configuration.verificationStatus, 'not-verified');
  assert.equal(store.configuration.verificationObservedAt, null);
});

test('failed verification preserves saved configuration and records safe observation', async (t) => {
  const store = new MemoryMailStore();
  const manager = await keys();
  const failed = { verify: async () => {
    throw Object.assign(new Error('private SMTP response'), { code: 'EAUTH', responseCode: 535 });
  }, close() {} } as unknown as Transporter;
  const log = t.mock.method(console, 'error', () => undefined);
  const saved = await new MailService(store, manager, () => failed).update('admin', complete());
  assert.equal(saved.revision, 1);
  assert.equal(saved.operationalState, 'configured');
  assert.equal(saved.verificationStatus, 'authentication-failed');
  assert.ok(saved.verificationObservedAt);
  assert.equal(store.configuration.smtpHost, 'smtp.example.com');
  assert.equal(store.configuration.verificationStatus, 'authentication-failed');
  assert.deepEqual(log.mock.calls[0].arguments, ['Mail verification failed',
    { category: 'authentication', code: 'EAUTH', responseCode: 535 }]);
  assert.ok(!JSON.stringify(log.mock.calls).includes('private SMTP response'));
});

test('SMTP delivery maps persisted security, sender, authentication, and recipient', async () => {
  const store = new MemoryMailStore();
  const manager = await keys();
  store.configuration = { revision: 1, enabled: true, transport: 'smtp', smtpHost: 'smtp.example.com',
    smtpPort: 587, smtpSecurity: 'starttls', smtpUsername: 'mailer',
    smtpPasswordEnvelope: manager.secretStore().encrypt('secret', 'smtp-password'),
    senderAddress: 'noreply@example.com', senderName: 'Kannabi',
    verificationStatus: 'not-verified', verificationObservedAt: null };
  let options: unknown;
  let message: unknown;
  let closed = false;
  const transporter = { sendMail: async (value: unknown) => { message = value; }, close: () => { closed = true; } } as unknown as Transporter;
  const service = new MailService(store, manager, (value) => { options = value; return transporter; });
  await service.send({ to: 'tester@EXAMPLE.COM', subject: 'Subject', text: 'First paragraph.\n\nSecond paragraph.' });
  assert.deepEqual(options, { host: 'smtp.example.com', port: 587, secure: false, requireTLS: true,
    ignoreTLS: false, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    auth: { user: 'mailer', pass: 'secret' } });
  assert.deepEqual(message, { from: { address: 'noreply@example.com', name: 'Kannabi' },
    to: 'tester@example.com', subject: 'Subject', text: 'First paragraph.\n\nSecond paragraph.', html: undefined });
  assert.equal(closed, true);
  assert.equal(store.configuration.verificationStatus, 'verified');
  assert.ok(store.configuration.verificationObservedAt);
});

test('disabled and provider failures return safe categories', async (t) => {
  const store = new MemoryMailStore();
  const manager = await keys();
  const disabledService = new MailService(store, manager);
  await assert.rejects(disabledService.send({ to: 'test@example.com', subject: 'Test', text: 'Test' }),
    (error: MailDeliveryError) => error.category === 'disabled');
  store.configuration = { ...disabled(), enabled: true, smtpHost: 'smtp.example.com', smtpPort: 25,
    smtpSecurity: 'none', senderAddress: 'noreply@example.com', senderName: 'Kannabi' };
  const failed = { sendMail: async () => { throw Object.assign(new Error('contains private provider details'), { code: 'EAUTH' }); },
    close() {} } as unknown as Transporter;
  const service = new MailService(store, manager, () => failed);
  const log = t.mock.method(console, 'error', () => undefined);
  await assert.rejects(service.send({ to: 'test@example.com', subject: 'Test', text: 'Test' }),
    (error: MailDeliveryError) => error.category === 'authentication' && error.message === 'SMTP authentication failed');
  assert.deepEqual(log.mock.calls[0].arguments, ['Mail delivery failed',
    { category: 'authentication', code: 'EAUTH', responseCode: undefined }]);
  assert.ok(!JSON.stringify(log.mock.calls).includes('private provider details'));
});
