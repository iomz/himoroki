import { createHash } from 'node:crypto';
import type { Driver } from 'neo4j-driver';
import { MailDeliveryError, type Mailer, type MailMessage } from './mail.js';

export const passwordResetPrefix = 'reset-password:';
export type PasswordResetIntent = 'setup' | 'recovery';
export interface PasswordResetTokenStore { deleteOutstandingResetTokens(userId: string): Promise<void>; }

export async function hashPasswordResetIdentifier(identifier: string): Promise<string> {
  if (!identifier.startsWith(passwordResetPrefix)) throw new Error('Unexpected password-reset identifier');
  const digest = createHash('sha256').update(identifier).digest('base64url');
  return passwordResetPrefix + digest;
}

export function passwordResetURL(baseURL: string, token: string): string {
  const url = new URL('/reset-password', new URL(baseURL).origin);
  url.hash = new URLSearchParams({ token }).toString();
  return url.href;
}

export function passwordResetMessage(baseURL: string, recipient: string, token: string,
  intent: PasswordResetIntent = 'recovery'): MailMessage {
  const url = passwordResetURL(baseURL, token);
  if (intent === 'setup') return {
    to: recipient,
    subject: 'Set up your Kannabi account',
    text: `An account has been created for you on Kannabi.

Open this link to set your password and finish setting up your account:
${url}

This link expires in one hour and can be used only once.

If you weren't expecting this account, you can ignore this email.`,
  };
  return {
    to: recipient,
    subject: 'Reset your Kannabi password',
    text: `We received a request to reset the password for your Kannabi account.

Open this link to choose a new password:
${url}

This link expires in one hour and can be used only once.

If you did not request a password reset, you can ignore this email. Your password will remain unchanged unless the link is used.`,
  };
}

export function queuePasswordResetEmail(mailer: Mailer, baseURL: string, recipient: string, token: string,
  intent: PasswordResetIntent = 'recovery'): void {
  const message = passwordResetMessage(baseURL, recipient, token, intent);
  void Promise.resolve().then(() => mailer.send(message)).catch((error: unknown) => {
    const category = error instanceof MailDeliveryError ? error.category : 'unknown';
    console.error('Password recovery mail delivery failed', { category });
  });
}

export class PasswordRecoveryStore {
  constructor(private readonly driver: Driver) {}

  async deleteOutstandingResetTokens(userId: string): Promise<void> {
    const session = this.driver.session();
    try {
      await session.executeWrite((transaction) => transaction.run(`MATCH (v:AuthVerification)
        WHERE v.value = $userId AND v.identifier STARTS WITH $prefix
        DETACH DELETE v`, { userId, prefix: passwordResetPrefix }));
    } finally { await session.close(); }
  }

  async intentForUser(userId: string): Promise<PasswordResetIntent> {
    const session = this.driver.session();
    try {
      const result = await session.executeRead((transaction) => transaction.run(`MATCH (u:User {id: $userId})
        RETURN EXISTS { MATCH (u)-[:HAS_AUTHACCOUNT]->(:AuthAccount {providerId: 'credential'}) } AS established`,
      { userId }));
      return result.records[0]?.get('established') === true ? 'recovery' : 'setup';
    } finally { await session.close(); }
  }
}

export async function invalidateOutstandingResetTokens(store: PasswordResetTokenStore, userId: string): Promise<void> {
  try { await store.deleteOutstandingResetTokens(userId); }
  catch { console.error('Outstanding password-reset tokens could not be invalidated'); }
}
