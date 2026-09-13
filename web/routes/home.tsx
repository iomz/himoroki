import { Form, Link, redirect, useNavigation } from 'react-router';
import { useState } from 'react';
import { api, authClient, unwrap, assetPath } from '../api';
import type { AssetIdentifier } from '../../server/identity.js';
import type { Route } from './+types/home';

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const { user } = await unwrap(await api.me.$get());
  const q = new URL(request.url).searchParams.get('q') ?? '';
  if (!user) return { user, q, groups: [], assets: [] };
  const [{ groups }, { assets }] = await Promise.all([
    api.groups.$get().then(unwrap), api.assets.$get({ query: { q } }).then(unwrap),
  ]);
  return { user, q, groups, assets };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const data = await request.formData();
  const text = (key: string) => String(data.get(key) ?? '');
  try {
    switch (text('intent')) {
      case 'signup':
      case 'signin': {
        const body = { email: text('email'), password: text('password'), name: text('name') };
        const result = text('intent') === 'signup' ? await authClient.signUp.email(body) : await authClient.signIn.email(body);
        if (result.error) throw new Error(result.error.message ?? 'Sign-in failed');
        break;
      }
      case 'signout': {
        const result = await authClient.signOut();
        if (result.error) throw new Error(result.error.message ?? 'Sign-out failed');
        break;
      }
      case 'group':
        await unwrap(await api.groups.$post({ json: { name: text('name') } }));
        break;
      case 'member':
        await unwrap(await api.groups[':key'].members.$post({ param: { key: text('groupKey') }, json: { userKey: text('userKey') } }));
        break;
      case 'leave':
        await unwrap(await api.groups[':key'].membership.$delete({ param: { key: text('groupKey') } }));
        break;
      case 'report': {
        const identifier: AssetIdentifier = text('scheme') === 'sgtin'
          ? { scheme: 'sgtin', gtin: text('gtin'), serial: text('serial') }
          : { scheme: 'grai', grai: text('grai') };
        const { asset } = await unwrap(await api.assets.$post({ json: {
          name: text('name'), identifiers: [identifier], groupKey: text('groupKey'),
        } }));
        return redirect(assetPath(asset.identifier));
      }
      default: throw new Error('Unknown action');
    }
    return redirect('/');
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Request failed' };
  }
}

export default function Home({ loaderData: { user, groups, assets, q }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  const [signup, setSignup] = useState(false);
  const [scheme, setScheme] = useState('sgtin');
  return <main>
    <header><h1>Himoroki</h1><p>Identity and context for physical assets.</p></header>
    {actionData?.error && <p role="alert">{actionData.error}</p>}
    {!user ? <section className="panel auth">
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
    </section> : <>
      <div className="toolbar"><p>Signed in as <strong>{user.name}</strong></p>
        <Form method="post"><button name="intent" value="signout" disabled={busy}>Sign out</button></Form>
      </div>
      <section className="panel">
        <h2>Groups</h2>
        <p className="hint">Your member key: <code>{user.key}</code>. Share it with a Group member to be added.</p>
        <Form method="post" className="inline"><input type="hidden" name="intent" value="group" />
          <label>New Group name<input name="name" required /></label><button disabled={busy}>Create Group</button>
        </Form>
        {!groups.length && <p>Create a Group, or ask an existing member to add you.</p>}
        {groups.map((group) => <details key={group.key}><summary>{group.name}</summary>
          <Form method="post" className="inline">
            <input type="hidden" name="intent" value="member" /><input type="hidden" name="groupKey" value={group.key} />
            <label>Member key<input name="userKey" required /></label><button disabled={busy}>Add member</button>
          </Form>
          <Form method="post"><input type="hidden" name="groupKey" value={group.key} />
            <p className="hint">Leaving removes your access to this Group’s private Assets, including those you reported.</p>
            <button name="intent" value="leave" disabled={busy} className="secondary">Leave Group</button>
          </Form>
        </details>)}
      </section>
      {groups.length > 0 && <section className="panel">
        <h2>Report Asset</h2>
        <Form method="post"><fieldset disabled={busy}>
          <input type="hidden" name="intent" value="report" />
          <label>Reporting Group<select name="groupKey" required defaultValue={groups.length === 1 ? groups[0].key : ''}>
            <option value="" disabled>Choose a Group</option>
            {groups.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
          </select></label>
          <label>Asset name<input name="name" required /></label>
          <label>Identifier scheme<select name="scheme" value={scheme} onChange={(e) => setScheme(e.target.value)}>
            <option value="sgtin">SGTIN — GTIN/JAN and serial</option><option value="grai">GRAI</option>
          </select></label>
          {scheme === 'sgtin' ? <div className="grid">
            <label>GTIN / JAN<input name="gtin" inputMode="numeric" required /></label>
            <label>Serial<input name="serial" maxLength={20} required /></label>
          </div> : <label>GRAI<input name="grai" required maxLength={30} />
            <span className="hint">AI 8003 value, including leading zero and individual serial.</span></label>}
          <p className="hint">Use an existing identifier. New Assets are private to the selected Group.</p>
          <button>Report Asset</button>
        </fieldset></Form>
      </section>}
      <section className="panel"><h2>Find Assets</h2>
        <Form method="get" className="inline"><label>Search by name<input name="q" defaultValue={q} maxLength={200} /></label><button>Find</button></Form>
        {!assets.length ? <p>No matching Assets.</p> : <ul className="assets">{assets.map((asset) =>
          <li key={assetPath(asset.identifier)}><Link to={assetPath(asset.identifier)}>{asset.name}</Link>
            <span>{asset.isPublic ? 'Public' : 'Group access'}</span></li>)}
        </ul>}
        <p className="hint">Up to 100 matching Assets you can read.</p>
      </section>
    </>}
  </main>;
}
