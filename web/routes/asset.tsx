import { Form, Link, redirect, useNavigation } from 'react-router';
import { canonicalIdentifier } from '../../server/identity.js';
import { api, unwrap, assetPath } from '../api';
import type { Route } from './+types/asset';

function identifierFrom(request: Request) {
  return canonicalIdentifier(Object.fromEntries(new URL(request.url).searchParams));
}
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const response = await api.asset.$get({ query: identifierFrom(request) });
  if (!response.ok) throw new Response('Asset not found or access unavailable.', { status: response.status });
  const result = await response.json();
  if (!('asset' in result)) throw new Response('Asset not found.', { status: 404 });
  return result;
}
export async function clientAction({ request }: Route.ClientActionArgs) {
  try {
    const identifier = identifierFrom(request);
    const data = await request.formData();
    await unwrap(await api.asset.$patch({ query: identifier, json: {
      name: String(data.get('name') ?? ''), isPublic: data.get('isPublic') === 'on',
    } }));
    return redirect(assetPath(identifier));
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Update failed' };
  }
}
export default function AssetPage({ loaderData: { asset, canEdit }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return <main>
    <Link to="/">← Inventory</Link><h1>{asset.name}</h1>
    {actionData?.error && <p role="alert">{actionData.error}</p>}
    <section className="panel"><h2>Asset identity</h2><dl>
      <dt>Scheme</dt><dd>{asset.identifier.scheme.toUpperCase()}</dd>
      {asset.identifier.scheme === 'sgtin' ? <><dt>GTIN</dt><dd>{asset.identifier.gtin}</dd>
        <dt>Serial</dt><dd>{asset.identifier.serial}</dd></> : <><dt>GRAI</dt><dd>{asset.identifier.grai}</dd></>}
      <dt>Visibility</dt><dd>{asset.isPublic ? 'Public — read access' : 'Private — Group access'}</dd>
      <dt>Owner</dt><dd>{asset.owner?.name ?? 'Not specified'}</dd>
      <dt>Collaboration Groups</dt><dd>{asset.groups.map((g) => g.name).join(', ')}</dd>
      <dt>Reported by</dt><dd>{asset.reportedBy.name}</dd>
      <dt>Reported at</dt><dd><time dateTime={asset.reportedAt}>{asset.reportedAt}</time></dd>
    </dl><p><Link to={assetPath(asset.identifier)}>Link to this Asset</Link></p></section>
    {canEdit && <section className="panel"><h2>Edit Asset</h2>
      <Form method="post"><fieldset disabled={busy}>
        <label>Asset name<input name="name" defaultValue={asset.name} required /></label>
        <label className="checkbox"><input type="checkbox" name="isPublic" defaultChecked={asset.isPublic} />Public</label>
        <p className="hint">Public Assets expose their full record to anyone with the link. Only Group members can edit.</p>
        <button>Save changes</button>
      </fieldset></Form>
    </section>}
  </main>;
}
