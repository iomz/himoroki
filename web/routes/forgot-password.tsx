import { Link } from 'react-router';
import { useState, type FormEvent } from 'react';
import { authClient } from '../api';
import { anonymousShellHandle } from '../anonymous-shell';

export const handle = anonymousShellHandle;

export default function ForgotPassword() {
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    try {
      const result = await authClient.requestPasswordReset({ email });
      if (result.error) throw result.error;
      setComplete(true);
    } catch {
      setError('Password recovery is temporarily unavailable. Try again later.');
    } finally { setBusy(false); }
  }

  return <div className="auth-workspace">
    <p className="eyebrow">Account recovery</p><h1>Reset your password</h1>
    <p>Enter your account email to request a reset link.</p>
    <section className="panel auth">
      {complete ? <>
        <h2>Check your email</h2>
        <p>If an eligible account exists for that email, a password-reset message has been sent.</p>
        <p className="hint">Delivery can take a few minutes. You can request another link if this one does not arrive.</p>
      </> : <>
        <h2>Request reset link</h2>
        {error && <p role="alert">{error}</p>}
        <form onSubmit={submit}><fieldset disabled={busy}>
          <label>Email<input name="email" type="email" required autoComplete="email" autoFocus /></label>
          <button type="submit">{busy ? 'Requesting…' : 'Send reset link'}</button>
        </fieldset></form>
      </>}
      <Link className="auth-link" to="/signin">Return to sign in</Link>
    </section>
  </div>;
}

export { WorkspaceError as ErrorBoundary } from '../route-error';
