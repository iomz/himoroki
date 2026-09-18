import { Form, Link, redirect, useLocation, useNavigation } from 'react-router';
import { api, authClient, unwrap } from '../api';
import type { Route } from './+types/signin';

export async function clientLoader() {
  if ((await unwrap(await api.me.$get())).user) throw redirect('/');
  return null;
}
export async function clientAction({ request }: Route.ClientActionArgs) {
  const data = await request.formData();
  const text = (key: string) => String(data.get(key) ?? '');
  try {
    const body = { email: text('email'), password: text('password'), name: text('name') };
    const result = text('intent') === 'signup' ? await authClient.signUp.email(body) : await authClient.signIn.email(body);
    if (result.error) throw new Error(result.error.message ?? 'Sign-in failed');
    return redirect('/');
  } catch (error) { return { error: error instanceof Error ? error.message : 'Sign-in failed' }; }
}
export default function SignIn({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  const signup = useLocation().pathname === '/signup';
  return <div className="auth-workspace">
    <p className="auth-intro">{signup ? 'Create your identity and begin building context.' : 'Your physical world, in context.'}</p>
    {actionData?.error && <p role="alert">{actionData.error}</p>}
    <section className="panel auth">
      <Form method="post"><fieldset disabled={busy}>
        <input type="hidden" name="intent" value={signup ? 'signup' : 'signin'} />
        {signup && <label>Name<input name="name" required autoComplete="name" /></label>}
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <div className="auth-password-field">
          <div className="auth-password-label">
            <label htmlFor="auth-password">Password</label>
            {!signup && <Link className="forgot-password-link" to="/forgot-password">Forgot password?</Link>}
          </div>
          <input id="auth-password" name="password" type="password" required minLength={signup ? 12 : undefined}
            autoComplete={signup ? 'new-password' : 'current-password'} />
        </div>
        {signup && <p className="hint">Use at least 12 characters.</p>}
        <button type="submit" className="auth-submit">{signup ? 'Create account' : 'Sign in'}</button>
      </fieldset></Form>
      {!signup && <>
        <div className="auth-divider" aria-hidden="true"><span>or</span></div>
        <button type="button" className="auth-passkey" disabled aria-describedby="passkey-availability">Continue with passkey</button>
        <p id="passkey-availability" className="auth-coming-soon">Coming soon</p>
      </>}
      <p className="auth-switch">
        {signup ? 'Already have an account? ' : 'New to Himoroki? '}
        <Link to={signup ? '/signin' : '/signup'}>{signup ? 'Sign in' : 'Create an account'}</Link>
      </p>

    </section>
  </div>;
}

export { WorkspaceError as ErrorBoundary } from '../route-error';
