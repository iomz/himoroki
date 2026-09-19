import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const envelopePrefix = 'secret:v1:';
const keyBytes = 32;
const nonceBytes = 12;
const tagBytes = 16;

export class SecretUnavailableError extends Error {}
export class SecretEnvelopeError extends Error {}

export interface SecretStore {
  encrypt(plaintext: string, purpose: string): string;
  decrypt(envelope: string, purpose: string): string;
}

export class AesGcmSecretStore implements SecretStore {
  constructor(private readonly key: Buffer) {
    if (key.length !== keyBytes) throw new Error('Instance master key must contain exactly 32 bytes');
  }

  encrypt(plaintext: string, purpose: string): string {
    if (!plaintext) throw new SecretEnvelopeError('Secret value is required');
    const nonce = randomBytes(nonceBytes);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(`kannabi:secret:v1:${purpose}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const envelope = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url');
    return envelopePrefix + envelope;
  }

  decrypt(envelope: string, purpose: string): string {
    if (!envelope.startsWith(envelopePrefix)) throw new SecretEnvelopeError('Unsupported secret envelope');
    const encoded = envelope.slice(envelopePrefix.length);
    const bytes = Buffer.from(encoded, 'base64url');
    if (!encoded || bytes.toString('base64url') !== encoded || bytes.length <= nonceBytes + tagBytes) {
      throw new SecretEnvelopeError('Malformed secret envelope');
    }
    try {
      const nonce = bytes.subarray(0, nonceBytes);
      const tag = bytes.subarray(nonceBytes, nonceBytes + tagBytes);
      const ciphertext = bytes.subarray(nonceBytes + tagBytes);
      const decipher = createDecipheriv('aes-256-gcm', this.key, nonce);
      decipher.setAAD(Buffer.from(`kannabi:secret:v1:${purpose}`, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new SecretEnvelopeError('Secret cannot be decrypted');
    }
  }
}

export type MasterKeyState = 'ready' | 'missing' | 'invalid';
export type MasterKeySource = 'environment' | 'file';

export function applicationDataDirectory(env: NodeJS.ProcessEnv = process.env,
  platform = process.platform, home = homedir()): string {
  if (env.KANNABI_DATA_DIR) return resolve(env.KANNABI_DATA_DIR);
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Kannabi');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'Kannabi');
  return join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'kannabi');
}

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64url');
  if (value.length !== 43 || key.length !== keyBytes || key.toString('base64url') !== value) {
    throw new Error('KANNABI_SECRET_KEY must be unpadded base64url encoding of exactly 32 bytes');
  }
  return key;
}

async function writeKey(path: string, key: Buffer, exclusive: boolean): Promise<void> {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | (exclusive ? constants.O_EXCL : constants.O_TRUNC)
    | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(key.toString('base64url') + '\n', 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
  await chmod(path, 0o600);
}

async function readManagedKey(path: string): Promise<Buffer> {
  const info = await lstat(path);
  if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077) !== 0)) {
    throw new Error('Instance master key file must be a private regular file');
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return decodeKey((await handle.readFile('utf8')).trim()); }
  finally { await handle.close(); }
}

export class MasterKeyManager {
  private constructor(readonly source: MasterKeySource, readonly keyPath: string | null,
    private stateValue: MasterKeyState, private storeValue: SecretStore | null) {}

  static async open(encryptedSecretsExist: boolean, env: NodeJS.ProcessEnv = process.env): Promise<MasterKeyManager> {
    const override = env.KANNABI_SECRET_KEY;
    if (override) return new MasterKeyManager('environment', null, 'ready', new AesGcmSecretStore(decodeKey(override)));
    const keyPath = join(applicationDataDirectory(env), 'master.key');
    try {
      return new MasterKeyManager('file', keyPath, 'ready', new AesGcmSecretStore(await readManagedKey(keyPath)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return new MasterKeyManager('file', keyPath, 'invalid', null);
      }
    }
    if (encryptedSecretsExist) return new MasterKeyManager('file', keyPath, 'missing', null);
    await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 });
    await chmod(dirname(keyPath), 0o700);
    const key = randomBytes(keyBytes);
    try { await writeKey(keyPath, key, true); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      return new MasterKeyManager('file', keyPath, 'ready', new AesGcmSecretStore(await readManagedKey(keyPath)));
    }
    return new MasterKeyManager('file', keyPath, 'ready', new AesGcmSecretStore(key));
  }

  get state(): MasterKeyState { return this.stateValue; }

  secretStore(): SecretStore {
    if (!this.storeValue) throw new SecretUnavailableError('Instance master key is unavailable');
    return this.storeValue;
  }

  async reset(clearEncryptedSecrets: () => Promise<void>): Promise<void> {
    if (this.source === 'environment') {
      await clearEncryptedSecrets();
      return;
    }
    const keyPath = this.keyPath!;
    await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 });
    await chmod(dirname(keyPath), 0o700);
    const key = randomBytes(keyBytes);
    const temporary = `${keyPath}.reset-${randomBytes(8).toString('hex')}`;
    try {
      await writeKey(temporary, key, true);
      await clearEncryptedSecrets();
      await rename(temporary, keyPath);
      await chmod(keyPath, 0o600);
      this.storeValue = new AesGcmSecretStore(key);
      this.stateValue = 'ready';
    } finally { await rm(temporary, { force: true }); }
  }
}
