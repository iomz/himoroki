import { redirect } from 'react-router';
import { api, unwrap } from '../api';
import { ProfileEditor, saveProfile } from '../profile-editor';
import type { Route } from './+types/profile';

export async function clientLoader() {
  const { user } = await unwrap(await api.me.$get());
  if (!user) throw redirect('/signin');
  return unwrap(await api.profile.$get());
}
export async function clientAction({ request }: Route.ClientActionArgs) { return saveProfile(request); }
export default function Profile({ loaderData: { member }, actionData }: Route.ComponentProps) {
  return <>
    <div className="page-heading"><div><p className="eyebrow">Account</p><h1>Profile</h1></div></div>
    {actionData?.error && <p role="alert">{actionData.error}</p>}
    {actionData?.saved && <p role="status" className="notice">Profile saved.</p>}
    <section className="panel form-panel"><ProfileEditor key={member.name} member={member} /></section>
  </>;
}
export { WorkspaceError as ErrorBoundary } from '../route-error';
