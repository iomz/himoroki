import { isIP } from 'node:net';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { record, requiredText, ValidationError } from './identity.js';
import { MasterKeyManager, SecretEnvelopeError, SecretUnavailableError, type MasterKeyState } from './secrets.js';

export const mailSecurityModes = ['tls', 'starttls', 'none'] as const;
export type MailSecurity = typeof mailSecurityModes[number];
export type MailVerificationStatus = 'not-verified' | 'verified' | 'connection-failed'
  | 'authentication-failed' | 'delivery-failed';
export type PasswordAction = { action: 'preserve' } | { action: 'replace'; value: string } | { action: 'clear' };
export type StoredMailConfiguration = {
  revision: number;
  enabled: boolean;
  transport: 'smtp';
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: MailSecurity | null;
  smtpUsername: string | null;
  smtpPasswordEnvelope: string | null;
  senderAddress: string | null;
  senderName: string | null;
  verificationStatus: MailVerificationStatus;
  verificationObservedAt: string | null;
};
export type PersistedMailSettings = Omit<StoredMailConfiguration,
  'revision' | 'verificationStatus' | 'verificationObservedAt'>;
export type MailConfiguration = Omit<StoredMailConfiguration, 'smtpPasswordEnvelope'> & {
  passwordState: 'none' | 'configured' | 'unavailable';
  operationalState: 'disabled' | 'incomplete' | 'configured' | 'credential-unavailable';
  masterKeySource: 'environment' | 'file';
  masterKeyState: MasterKeyState;
};
export type MailMessage = { to: string; subject: string; text: string; html?: string };

export interface Mailer { send(message: MailMessage): Promise<void>; }
export interface MailConfigurationStore {
  readMailConfiguration(actorKey: string): Promise<StoredMailConfiguration>;
  effectiveMailConfiguration(): Promise<StoredMailConfiguration>;
  replaceMailConfiguration(actorKey: string, expectedRevision: number,
    configuration: PersistedMailSettings): Promise<StoredMailConfiguration>;
  recordMailVerification(expectedRevision: number, status: MailVerificationStatus,
    observedAt: string): Promise<StoredMailConfiguration | null>;
  resetEncryptedSecrets(actorKey: string, expectedRevision: number): Promise<StoredMailConfiguration>;
}

export class MailRevisionConflictError extends Error {}
export class MailDeliveryError extends Error {
  constructor(readonly category: 'disabled' | 'incomplete' | 'credential-unavailable' | 'connection'
    | 'authentication' | 'recipient' | 'delivery', message: string) { super(message); }
}

function optionalText(value: unknown, field: string, maximum: number): string | null {
  if (value === null || value === '') return null;
  const text = requiredText(value, field);
  if (text.length > maximum) throw new ValidationError(`${field} is too long`);
  return text;
}

function hostname(value: unknown): string | null {
  const host = optionalText(value, 'SMTP host', 253);
  if (!host) return null;
  if (isIP(host)) return host;
  if (!host.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    throw new ValidationError('SMTP host must be a hostname or IP address');
  }
  return host;
}

export function mailbox(value: unknown, field = 'Email address'): string {
  const address = requiredText(value, field);
  if (address.length > 254 || /[\u0000-\u0020\u007f]/.test(address)) throw new ValidationError(`${field} is invalid`);
  const at = address.lastIndexOf('@');
  if (at < 1 || at !== address.indexOf('@') || at > 64) throw new ValidationError(`${field} is invalid`);
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) || local.startsWith('.')
      || local.endsWith('.') || local.includes('..')
      || !domain.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) {
    throw new ValidationError(`${field} is invalid`);
  }
  return `${local}@${domain.toLowerCase()}`;
}

function passwordAction(value: unknown): PasswordAction {
  const input = record(value, ['action', 'value']);
  if (input.action === 'preserve' || input.action === 'clear') {
    record(input, ['action']);
    return { action: input.action };
  }
  if (input.action === 'replace') {
    record(input, ['action', 'value']);
    if (typeof input.value !== 'string' || !input.value.length || input.value.length > 1024 || input.value.includes('\0')) {
      throw new ValidationError('SMTP password must contain 1–1024 characters');
    }
    return { action: 'replace', value: input.value };
  }
  throw new ValidationError('SMTP password action is invalid');
}

type MailUpdate = Omit<PersistedMailSettings, 'smtpPasswordEnvelope'> & {
  revision: number; password: PasswordAction;
};

export function validateMailUpdate(value: unknown): MailUpdate {
  const input = record(value, ['revision', 'enabled', 'transport', 'smtpHost', 'smtpPort', 'smtpSecurity',
    'smtpUsername', 'senderAddress', 'senderName', 'password']);
  if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new ValidationError('Mail revision is invalid');
  if (typeof input.enabled !== 'boolean') throw new ValidationError('Mail enabled state is required');
  if (input.transport !== 'smtp') throw new ValidationError('SMTP is the only supported mail transport');
  const smtpHost = hostname(input.smtpHost);
  const smtpPort = input.smtpPort === null || input.smtpPort === '' ? null : Number(input.smtpPort);
  if (smtpPort !== null && (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
    throw new ValidationError('SMTP port must be an integer between 1 and 65535');
  }
  const smtpSecurity = input.smtpSecurity === null || input.smtpSecurity === '' ? null : input.smtpSecurity;
  if (smtpSecurity !== null && !mailSecurityModes.includes(smtpSecurity as MailSecurity)) {
    throw new ValidationError('SMTP security mode is unsupported');
  }
  const smtpUsername = optionalText(input.smtpUsername, 'SMTP username', 320);
  const senderAddress = input.senderAddress === null || input.senderAddress === '' ? null : mailbox(input.senderAddress, 'Sender address');
  const senderName = optionalText(input.senderName, 'Sender name', 100);
  return { revision: Number(input.revision), enabled: input.enabled, transport: 'smtp', smtpHost, smtpPort,
    smtpSecurity: smtpSecurity as MailSecurity | null, smtpUsername, senderAddress, senderName,
    password: passwordAction(input.password) };
}

function validateEffective(configuration: PersistedMailSettings | StoredMailConfiguration): void {
  const hasPassword = Boolean(configuration.smtpPasswordEnvelope);
  if (Boolean(configuration.smtpUsername) !== hasPassword) {
    throw new ValidationError('SMTP username and password must be configured together');
  }
  if (configuration.smtpSecurity === 'none' && hasPassword) {
    throw new ValidationError('Unencrypted SMTP cannot use authentication');
  }
  if (configuration.enabled && (!configuration.smtpHost || !configuration.smtpPort || !configuration.smtpSecurity
      || !configuration.senderAddress || !configuration.senderName)) {
    throw new ValidationError('Enabled mail requires complete SMTP and sender configuration');
  }
}

type TransportFactory = (options: SMTPTransport.Options) => Transporter;

export class MailService implements Mailer {
  constructor(private readonly store: MailConfigurationStore, private readonly keys: MasterKeyManager,
    private readonly transportFactory: TransportFactory = (options) => nodemailer.createTransport(options)) {}

  private passwordState(configuration: StoredMailConfiguration): MailConfiguration['passwordState'] {
    if (!configuration.smtpPasswordEnvelope) return 'none';
    try {
      this.keys.secretStore().decrypt(configuration.smtpPasswordEnvelope, 'smtp-password');
      return 'configured';
    } catch (error) {
      if (error instanceof SecretUnavailableError || error instanceof SecretEnvelopeError) return 'unavailable';
      throw error;
    }
  }

  private public(configuration: StoredMailConfiguration): MailConfiguration {
    const passwordState = this.passwordState(configuration);
    let operationalState: MailConfiguration['operationalState'] = configuration.enabled ? 'configured' : 'disabled';
    if (passwordState === 'unavailable') operationalState = 'credential-unavailable';
    else {
      try { validateEffective(configuration); }
      catch { operationalState = 'incomplete'; }
    }
    const { smtpPasswordEnvelope: _secret, ...safe } = configuration;
    return { ...safe, passwordState, operationalState, masterKeySource: this.keys.source,
      masterKeyState: this.keys.state };
  }

  async configuration(actorKey: string): Promise<MailConfiguration> {
    return this.public(await this.store.readMailConfiguration(actorKey));
  }

  async update(actorKey: string, value: unknown): Promise<MailConfiguration> {
    const input = validateMailUpdate(value);
    const current = await this.store.readMailConfiguration(actorKey);
    if (current.revision !== input.revision) throw new MailRevisionConflictError('Mail configuration changed; reload and try again');
    if (current.smtpPasswordEnvelope) {
      try { this.keys.secretStore().decrypt(current.smtpPasswordEnvelope, 'smtp-password'); }
      catch { throw new SecretUnavailableError('Instance master-key recovery is required'); }
    }
    let smtpPasswordEnvelope = current.smtpPasswordEnvelope;
    if (input.password.action === 'replace') {
      smtpPasswordEnvelope = this.keys.secretStore().encrypt(input.password.value, 'smtp-password');
    } else if (input.password.action === 'clear') smtpPasswordEnvelope = null;
    const { revision, password: _password, ...fields } = input;
    const next = { ...fields, smtpPasswordEnvelope };
    validateEffective(next);
    if (smtpPasswordEnvelope) {
      try { this.keys.secretStore().decrypt(smtpPasswordEnvelope, 'smtp-password'); }
      catch { throw new SecretUnavailableError('SMTP credentials must be re-entered after master-key recovery'); }
    }
    const saved = await this.store.replaceMailConfiguration(actorKey, revision, next);
    return this.public(saved.enabled ? await this.verifyAndObserve(saved) : saved);
  }

  async resetSecrets(actorKey: string, value: unknown): Promise<MailConfiguration> {
    const input = record(value, ['revision', 'confirmation']);
    if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0
        || input.confirmation !== 'reset-encrypted-secrets') {
      throw new ValidationError('Explicit encrypted-secret reset confirmation is required');
    }
    await this.store.readMailConfiguration(actorKey);
    let reset!: StoredMailConfiguration;
    await this.keys.reset(async () => {
      reset = await this.store.resetEncryptedSecrets(actorKey, Number(input.revision));
    });
    return this.public(reset);
  }

  private transporter(configuration: StoredMailConfiguration): Transporter {
    if (!configuration.enabled) throw new MailDeliveryError('disabled', 'Mail delivery is disabled');
    try { validateEffective(configuration); }
    catch { throw new MailDeliveryError('incomplete', 'Mail configuration is incomplete'); }
    let password: string | undefined;
    if (configuration.smtpPasswordEnvelope) {
      try { password = this.keys.secretStore().decrypt(configuration.smtpPasswordEnvelope, 'smtp-password'); }
      catch { throw new MailDeliveryError('credential-unavailable', 'SMTP credentials must be re-entered'); }
    }
    const options: SMTPTransport.Options = {
      host: configuration.smtpHost!, port: configuration.smtpPort!,
      secure: configuration.smtpSecurity === 'tls',
      requireTLS: configuration.smtpSecurity === 'starttls',
      ignoreTLS: configuration.smtpSecurity === 'none',
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      ...(configuration.smtpUsername ? { auth: { user: configuration.smtpUsername, pass: password! } } : {}),
    };
    return this.transportFactory(options);
  }

  private deliveryError(error: unknown, operation: 'verification' | 'delivery'): MailDeliveryError {
    const details = typeof error === 'object' && error !== null
      ? error as { code?: string; responseCode?: number } : {};
    const category = details.code === 'EAUTH' ? 'authentication'
      : details.code === 'ECONNECTION' || details.code === 'ETIMEDOUT' || details.code === 'ESOCKET' ? 'connection'
        : details.responseCode && details.responseCode >= 500 && details.responseCode < 600 ? 'recipient' : 'delivery';
    console.error(`Mail ${operation} failed`, { category, code: details.code, responseCode: details.responseCode });
    return new MailDeliveryError(category, category === 'authentication' ? 'SMTP authentication failed'
      : category === 'connection' ? 'SMTP server could not be reached'
        : category === 'recipient' ? 'SMTP server rejected the recipient' : `Mail ${operation} failed`);
  }

  private verificationStatus(error?: MailDeliveryError): MailVerificationStatus {
    if (!error) return 'verified';
    if (error.category === 'connection') return 'connection-failed';
    if (error.category === 'authentication') return 'authentication-failed';
    return 'delivery-failed';
  }

  private async observe(configuration: StoredMailConfiguration, status: MailVerificationStatus): Promise<StoredMailConfiguration> {
    const observedAt = new Date().toISOString();
    try {
      return await this.store.recordMailVerification(configuration.revision, status, observedAt)
        ?? { ...configuration, verificationStatus: status, verificationObservedAt: observedAt };
    } catch {
      console.error('Mail verification observation could not be stored');
      return { ...configuration, verificationStatus: status, verificationObservedAt: observedAt };
    }
  }

  private async verifyAndObserve(configuration: StoredMailConfiguration): Promise<StoredMailConfiguration> {
    let error: MailDeliveryError | undefined;
    let transporter: Transporter | undefined;
    try {
      transporter = this.transporter(configuration);
      await transporter.verify();
    } catch (cause) {
      error = cause instanceof MailDeliveryError ? cause : this.deliveryError(cause, 'verification');
    } finally {
      try { transporter?.close(); }
      catch { console.error('Mail transport close failed'); }
    }
    return this.observe(configuration, this.verificationStatus(error));
  }

  async send(message: MailMessage): Promise<void> {
    const configuration = await this.store.effectiveMailConfiguration();
    const to = mailbox(message.to, 'Recipient address');
    const transporter = this.transporter(configuration);
    try {
      await transporter.sendMail({ from: { address: configuration.senderAddress!, name: configuration.senderName! },
        to, subject: requiredText(message.subject, 'Mail subject'), text: requiredText(message.text, 'Mail body'), html: message.html });
      await this.observe(configuration, 'verified');
    } catch (cause) {
      const error = cause instanceof MailDeliveryError ? cause : this.deliveryError(cause, 'delivery');
      await this.observe(configuration, this.verificationStatus(error));
      throw error;
    } finally {
      try { transporter.close(); }
      catch { console.error('Mail transport close failed'); }
    }
  }

  async sendTest(actorKey: string, value: unknown): Promise<void> {
    await this.store.readMailConfiguration(actorKey);
    const input = record(value, ['recipient']);
    const recipient = mailbox(input.recipient, 'Test recipient');
    await this.send({ to: recipient, subject: 'Himoroki mail delivery test',
      text: 'Himoroki successfully sent this test message using the persisted mail configuration.' });
  }
}
