import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { AesGcmSecretStore, applicationDataDirectory, MasterKeyManager, SecretEnvelopeError,
  SecretUnavailableError } from './secrets.js';

function directory(t: TestContext) {
  const path = mkdtempSync(join(tmpdir(), 'himoroki-secrets-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('AES-GCM envelopes round trip, randomize nonces, bind purpose, and reject tampering', () => {
  const store = new AesGcmSecretStore(randomBytes(32));
  const first = store.encrypt('smtp-password-value', 'smtp-password');
  const second = store.encrypt('smtp-password-value', 'smtp-password');
  assert.match(first, /^secret:v1:[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.ok(!first.includes('smtp-password-value'));
  assert.equal(store.decrypt(first, 'smtp-password'), 'smtp-password-value');
  assert.throws(() => store.decrypt(first, 'other-purpose'), SecretEnvelopeError);
  assert.throws(() => new AesGcmSecretStore(randomBytes(32)).decrypt(first, 'smtp-password'), SecretEnvelopeError);
  const changed = first.slice(0, -1) + (first.endsWith('A') ? 'B' : 'A');
  assert.throws(() => store.decrypt(changed, 'smtp-password'), SecretEnvelopeError);
  for (const malformed of ['', 'secret:v2:abc', 'secret:v1:***', 'secret:v1:AAAA']) {
    assert.throws(() => store.decrypt(malformed, 'smtp-password'), SecretEnvelopeError);
  }
});

test('managed master key is generated privately and reused across restarts', async (t) => {
  const data = directory(t);
  const env = { HIMOROKI_DATA_DIR: data };
  const first = await MasterKeyManager.open(false, env);
  assert.equal(first.state, 'ready');
  assert.equal(first.source, 'file');
  const path = join(data, 'master.key');
  if (process.platform !== 'win32') {
    assert.equal(statSync(data).mode & 0o777, 0o700);
    assert.equal(statSync(path).mode & 0o777, 0o600);
  }
  const envelope = first.secretStore().encrypt('kept', 'smtp-password');
  const second = await MasterKeyManager.open(true, env);
  assert.equal(second.secretStore().decrypt(envelope, 'smtp-password'), 'kept');
  assert.match(readFileSync(path, 'utf8').trim(), /^[A-Za-z0-9_-]{43}$/);
});

test('external key has strict encoding and never creates managed data', async (t) => {
  const data = directory(t);
  const encoded = randomBytes(32).toString('base64url');
  const manager = await MasterKeyManager.open(false, { HIMOROKI_DATA_DIR: data, HIMOROKI_SECRET_KEY: encoded });
  assert.equal(manager.source, 'environment');
  assert.equal(manager.state, 'ready');
  assert.throws(() => manager.secretStore().decrypt('secret:v1:bad', 'smtp-password'));
  await assert.rejects(MasterKeyManager.open(false, { HIMOROKI_SECRET_KEY: 'too-short' }),
    /exactly 32 bytes/);
  assert.equal(statSync(data).isDirectory(), true);
  assert.throws(() => statSync(join(data, 'master.key')));
});

test('missing or invalid managed key with ciphertext remains unavailable until explicit reset', async (t) => {
  const data = directory(t);
  const env = { HIMOROKI_DATA_DIR: data };
  const missing = await MasterKeyManager.open(true, env);
  assert.equal(missing.state, 'missing');
  assert.throws(() => missing.secretStore(), SecretUnavailableError);
  let cleared = false;
  await missing.reset(async () => { cleared = true; assert.throws(() => statSync(join(data, 'master.key'))); });
  assert.equal(cleared, true);
  assert.equal(missing.state, 'ready');
  assert.doesNotThrow(() => missing.secretStore());

  writeFileSync(join(data, 'master.key'), 'not-a-key\n', { mode: 0o600 });
  const invalid = await MasterKeyManager.open(true, env);
  assert.equal(invalid.state, 'invalid');
  assert.throws(() => invalid.secretStore(), SecretUnavailableError);
});

test('managed key rejects symlinks and failed reset preserves missing state', { skip: process.platform === 'win32' }, async (t) => {
  const data = directory(t);
  const target = join(data, 'target');
  writeFileSync(target, randomBytes(32).toString('base64url') + '\n', { mode: 0o600 });
  symlinkSync(target, join(data, 'master.key'));
  const manager = await MasterKeyManager.open(true, { HIMOROKI_DATA_DIR: data });
  assert.equal(manager.state, 'invalid');
  await assert.rejects(manager.reset(async () => { throw new Error('database failed'); }), /database failed/);
  assert.equal(manager.state, 'invalid');
  assert.equal(readFileSync(target, 'utf8').trim().length, 43);
});

test('application data defaults follow platform conventions', () => {
  assert.equal(applicationDataDirectory({}, 'linux', '/home/example'), '/home/example/.local/share/himoroki');
  assert.equal(applicationDataDirectory({ XDG_DATA_HOME: '/data' }, 'linux', '/home/example'), '/data/himoroki');
  assert.equal(applicationDataDirectory({}, 'darwin', '/Users/example'), '/Users/example/Library/Application Support/Himoroki');
  assert.equal(applicationDataDirectory({ LOCALAPPDATA: 'C:\\Data' }, 'win32', 'C:\\Users\\example'), 'C:\\Data/Himoroki');
});
