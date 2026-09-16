import { Form, redirect, useNavigation } from 'react-router';
import { api, unwrap } from '../api';
import { TimezonePicker } from '../timezone-picker';
import type { Route } from './+types/administration';

export async function clientLoader() {
  const { user, isAdmin } = await unwrap(await api.me.$get());
  if (!user) throw redirect('/signin');
  if (!isAdmin) throw new Response('Administrator access required.', { status: 403 });
  return unwrap(await api.settings.$get());
}
export async function clientAction({ request }: Route.ClientActionArgs) {
  const data = await request.formData();
  try {
    await unwrap(await api.settings.$patch({ json: {
      requirePhoto: data.get('requirePhoto') === 'on', displayTimezone: String(data.get('displayTimezone') ?? ''),
    } }));
    return { saved: true, error: null };
  } catch (error) { return { saved: false, error: error instanceof Error ? error.message : 'Settings update failed' }; }
}
export default function Administration({ loaderData: { settings }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return <>
    <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>Instance settings</h1><p>Reporting policy and time presentation for this deployment.</p></div></div>
    {actionData?.error && <p role="alert">{actionData.error}</p>}
    {actionData?.saved && <p role="status" className="notice">Settings saved.</p>}
    <section className="panel form-panel"><h2>Reporting and display</h2>
        <Form method="post"><fieldset disabled={busy}>
          <input type="hidden" name="intent" value="settings" />
          <label className="checkbox"><input type="checkbox" name="requirePhoto" defaultChecked={settings.requirePhoto} />Require photo when reporting an Asset</label>
          <TimezonePicker name="displayTimezone" value={settings.displayTimezone} />
          <button>Save settings</button>
        </fieldset></Form>

      <p className="hint">The photo requirement applies to new reports. Timestamps stay stored as absolute instants.</p>
    </section>
  </>;
}

export { WorkspaceError as ErrorBoundary } from '../route-error';
