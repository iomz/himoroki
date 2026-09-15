import { Form, redirect, useNavigation } from 'react-router';
import { useState } from 'react';
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
  const [signup, setSignup] = useState(false);
  return <div className="auth-workspace">
    <p className="eyebrow">Your physical world, in context</p><h1>Welcome to Himoroki</h1>
    <p>Sign in to find, report, and care for your Assets.</p>
    {actionData?.error && <p role="alert">{actionData.error}</p>}
    <section className="panel auth">
      <h2>{signup ? 'Create account' : 'Sign in'}</h2>
      <Form method="post"><fieldset disabled={busy}>
        <input type="hidden" name="intent" value={signup ? 'signup' : 'signin'} />
        {signup && <label>Name<input name="name" required autoComplete="name" /></label>}
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required minLength={signup ? 12 : undefined}
          autoComplete={signup ? 'new-password' : 'current-password'} /></label>
        {signup && <p className="hint">Use at least 12 characters.</p>}
        <button type="submit">{signup ? 'Create account' : 'Sign in'}</button>
      </fieldset></Form>
      <button type="button" className="secondary" onClick={() => setSignup(!signup)}>
        {signup ? 'Already have an account? Sign in' : 'Create an account'}
      </button>

    </section>
  </div>;
}

export { WorkspaceError as ErrorBoundary } from '../route-error';
