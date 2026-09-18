import { Form, Link, redirect, useNavigation } from 'react-router';
import { displayInstant } from '../../server/settings.js';
import { canonicalIdentifier } from '../../server/identity.js';
import { api, unwrap, assetPath } from '../api';
import { ReporterAttribution } from '../reporter-attribution';
import type { Route } from './+types/asset';

function identifierFrom(request: Request) {
  return canonicalIdentifier(Object.fromEntries(new URL(request.url).searchParams));
}
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const response = await api.asset.$get({ query: identifierFrom(request) });
  if (!response.ok) throw new Response('Asset not found or access unavailable.', { status: response.status });
  const result = await response.json();
  if (!('asset' in result)) throw new Response('Asset not found.', { status: 404 });
  const { settings } = await unwrap(await api.settings.$get());
  return { ...result, settings };
}
export async function clientAction({ request }: Route.ClientActionArgs) {
  try {
    const identifier = identifierFrom(request);
    const data = await request.formData();
    if (data.get('intent') === 'photo') {
      const form = new FormData();
      const photo = data.get('photo');
      if (!(photo instanceof File)) throw new Error('Select a photo');
      form.set('photo', photo);
      await unwrap(await fetch('/api/photo?' + new URLSearchParams(identifier), { method: 'POST', body: form }));
      return redirect(assetPath(identifier));
    }
    await unwrap(await api.asset.$patch({ query: identifier, json: {
      name: String(data.get('name') ?? ''), isPublic: data.get('isPublic') === 'on',
    } }));
    return redirect(assetPath(identifier));
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Update failed' };
  }
}
export default function AssetPage({ loaderData: { asset, canEdit, settings }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return <>
    <Link to="/" className="back-link">← Assets</Link><div className="page-heading"><div><p className="eyebrow">Asset</p><h1>{asset.name}</h1></div><span className="badge">{asset.isPublic ? "Public" : "Group access"}</span></div>
    {actionData?.error && <p role="alert">{actionData.error}</p>}
    <section className="panel"><h2>Asset identity</h2><dl>
      <dt>Scheme</dt><dd>{asset.identifier.scheme.toUpperCase()}</dd>
      {asset.identifier.scheme === 'sgtin' ? <><dt>GTIN</dt><dd>{asset.identifier.gtin}</dd>
        <dt>Serial</dt><dd>{asset.identifier.serial}</dd></> : <><dt>GRAI</dt><dd>{asset.identifier.grai}</dd></>}
      <dt>Visibility</dt><dd>{asset.isPublic ? 'Public — read access' : 'Private — Group access'}</dd>
      <dt>Owner</dt><dd>{asset.owner?.name ?? 'Not specified'}</dd>
      <dt>Collaboration Groups</dt><dd>{asset.groups.map((g) => g.name).join(', ')}</dd>
      <dt>Reported by</dt><dd><ReporterAttribution reporter={asset.reportedBy} /></dd>
      <dt>Reported at</dt><dd><time dateTime={asset.reportedAt}>{displayInstant(asset.reportedAt, settings.displayTimezone)}</time> ({settings.displayTimezone})</dd>
    </dl><p><Link to={assetPath(asset.identifier)}>Link to this Asset</Link></p></section>
    <section className="panel"><h2>Photos</h2>
      {!asset.photos.length && <p>No photos yet.</p>}
      <div className="photos">{asset.photos.map((photo) => <img key={photo.key}
        src={'/api/photos/' + photo.key + '?' + new URLSearchParams(asset.identifier)} alt={'Photo of ' + asset.name} />)}</div>
      {canEdit && <Form method="post" encType="multipart/form-data"><fieldset disabled={busy}>
        <input type="hidden" name="intent" value="photo" />
        <label>Add photo<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required /></label>
        <p className="hint">JPEG, PNG, or WebP, up to 10 MiB.</p><button>Upload photo</button>
      </fieldset></Form>}
    </section>
    {canEdit && <section className="panel"><h2>Edit Asset</h2>
      <Form method="post"><fieldset disabled={busy}>
        <label>Asset name<input name="name" defaultValue={asset.name} required /></label>
        <label className="checkbox"><input type="checkbox" name="isPublic" defaultChecked={asset.isPublic} />Public</label>
        <p className="hint">Public Assets expose their full record to anyone with the link. Only Group members can edit.</p>
        <button>Save changes</button>
      </fieldset></Form>
    </section>}
  </>;
}

export { WorkspaceError as ErrorBoundary } from '../route-error';
