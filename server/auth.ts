import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import { getAuthTables } from 'better-auth/db';
import { neo4jAdapter, buildSchemaStatements } from 'neo4j-better-auth';
import type { Driver } from 'neo4j-driver';
import { requiredText } from './identity.js';
import type { Mailer } from './mail.js';
import { hashPasswordResetIdentifier, invalidateOutstandingResetTokens, PasswordRecoveryStore, passwordResetPrefix,
  queuePasswordResetEmail } from './password-recovery.js';

export async function createAuth(driver: Driver, baseURL: string, secret: string, mailer?: Mailer) {
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
  const origin = new URL(baseURL).origin;
  const recovery = new PasswordRecoveryStore(driver);
  const auth = betterAuth({
    baseURL: origin,
    secret,
    trustedOrigins: [origin],
    database: neo4jAdapter({ driver }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      ...(mailer ? { sendResetPassword: async ({ user, token }: { user: { id: string; email: string }; token: string }) => {
        queuePasswordResetEmail(mailer, origin, user.email, token, await recovery.intentForUser(user.id));
      } } : {}),
      onPasswordReset: async ({ user }) => {
        await invalidateOutstandingResetTokens(recovery, user.id);
      },
    },
    user: {
      modelName: 'User',
      // Current password step-up is enforced by Himoroki's profile endpoint.
      // Revisit this immediate-update policy when email verification is introduced.
      changeEmail: { enabled: true, updateEmailWithoutVerification: true },
      additionalFields: {
        // Same User node as the domain model. Never accepted from signup input.
        key: { type: 'string', required: false, input: false, unique: true },
      },
    },
    session: { modelName: 'AuthSession', cookieCache: { enabled: false } },
    account: { modelName: 'AuthAccount' },
    verification: {
      modelName: 'AuthVerification',
      storeIdentifier: {
        default: 'plain',
        overrides: { [passwordResetPrefix]: { hash: hashPasswordResetIdentifier } },
      },
    },
    advanced: {
      database: { generateId: 'uuid' },
      // The Node entry point overwrites this header with the TCP peer address.
      ipAddress: { ipAddressHeaders: ['x-himoroki-client-ip'] },
    },
    databaseHooks: {
      user: { create: { before: async (user) => {
        try { return { data: { ...user, name: requiredText(user.name, 'name'), key: randomUUID() } }; }
        catch { throw new APIError('BAD_REQUEST', { message: 'A valid name is required' }); }
      } } },
    },
    rateLimit: { enabled: true },
    plugins: [admin()],
  });
  const tables = getAuthTables(auth.options);
  const session = driver.session();
  try {
    const statements = buildSchemaStatements(tables,
      (model) => tables[model].modelName ?? model,
      ({ model, field }) => tables[model].fields[field]?.fieldName ?? field);
    for (const statement of statements) await session.run(statement);
  } finally { await session.close(); }
  return auth;
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
