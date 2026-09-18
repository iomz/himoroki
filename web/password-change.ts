export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions: true;
};

export function passwordChangeInput(data: FormData): { body: PasswordChangeInput; error: null }
  | { body: null; error: string } {
  const currentPassword = String(data.get('currentPassword') ?? '');
  const newPassword = String(data.get('newPassword') ?? '');
  const confirmation = String(data.get('confirmation') ?? '');
  if (newPassword !== confirmation) return { body: null, error: 'Passwords do not match.' };
  return { body: { currentPassword, newPassword, revokeOtherSessions: true }, error: null };
}
