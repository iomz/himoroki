import { redirect } from 'react-router';
import { api, unwrap } from '../api';
import { ProfileEditor, saveProfile } from '../profile-editor';
import { AppearanceSelector } from '../appearance-selector';
import { themeById } from '../themes';
import type { AppearancePreference } from '../../shared/appearance';
import { useThemeRuntime } from '../theme-runtime';
import type { Route } from './+types/profile';

export async function clientLoader() {
  const { user } = await unwrap(await api.me.$get());
  if (!user) throw redirect('/signin');
  return unwrap(await api.profile.$get());
}
export async function clientAction({ request }: Route.ClientActionArgs) {
  const data = await request.clone().formData();
  if (data.get('intent') !== 'appearance') return { ...await saveProfile(request), section: 'profile' as const };
  try {
    await unwrap(await api.profile.appearance.$patch({ json: {
      appearance: String(data.get('appearance') ?? '') as AppearancePreference,
    } }));
    return { saved: true, error: null, key: null, section: 'appearance' as const,
      appearance: String(data.get('appearance')) as AppearancePreference };
  } catch (error) {
    return { saved: false, error: error instanceof Error ? error.message : 'Appearance update failed', key: null, section: 'appearance' as const };
  }
}
export default function Profile({ loaderData: { member }, actionData }: Route.ComponentProps) {
  const runtime = useThemeRuntime();
  return <>
    <div className="page-heading"><div><p className="eyebrow">Account</p><h1>Profile</h1></div></div>
    {actionData?.error && <p role="alert">{actionData.error}</p>}
    {actionData?.saved && <p role="status" className="notice">Profile saved.</p>}
    <section className="panel form-panel"><ProfileEditor key={member.name} member={member} /></section>
    <section className="panel form-panel"><AppearanceSelector value={runtime.appearance} theme={themeById(runtime.themeId)} /></section>
  </>;
}
export { WorkspaceError as ErrorBoundary } from '../route-error';
