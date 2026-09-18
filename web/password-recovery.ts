export function resetTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('token');
  return token?.trim() || null;
}

export function isInvalidResetError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'INVALID_TOKEN' || error?.code === 'USER_NOT_FOUND'
    || error?.message === 'Invalid token' || error?.message === 'User not found';
}
