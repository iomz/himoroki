import type { MailConfiguration, MailSecurity, PasswordAction } from '../server/mail';

export function mailPasswordAction(passwordState: MailConfiguration['passwordState'],
  security: MailSecurity | '', password: string, removePassword: boolean): PasswordAction {
  if (security === 'none' || removePassword) return { action: 'clear' };
  if (password.length) return { action: 'replace', value: password };
  return passwordState === 'none' ? { action: 'clear' } : { action: 'preserve' };
}
