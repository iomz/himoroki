import { redirect } from 'react-router';
import { api, authClient, unwrap } from '../api';
import { DeleteAccount, EmailAddressEditor, PasswordEditor, ProfileEditor, saveProfile } from '../profile-editor';
import { passwordChangeInput } from '../password-change';
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
  if (data.get('intent') === 'delete') {
    try {
      await unwrap(await api.profile.$delete());
      return redirect('/signin');
    } catch (error) {
      return { saved: false, error: error instanceof Error ? error.message : 'Account could not be deleted',
        key: null, section: 'delete' as const };
    }
  }
  if (data.get('intent') === 'password') {
    const input = passwordChangeInput(data);
    if (!input.body) return { saved: false, error: input.error, key: null, section: 'password' as const };
    try {
      const result = await authClient.changePassword(input.body);
      if (result.error) throw result.error;
      return { saved: true, error: null, key: null, section: 'password' as const };
    } catch (error) {
      return { saved: false, error: error instanceof Error ? error.message : 'Password could not be changed',
        key: null, section: 'password' as const };
    }
  }
  if (data.get('intent') === 'email') {
    try {
      await unwrap(await api.profile.email.$patch({ json: {
        newEmail: String(data.get('newEmail') ?? ''),
        currentPassword: String(data.get('currentPassword') ?? ''),
      } }));
      return { saved: true, error: null, key: null, section: 'email' as const };
    } catch (error) {
      return { saved: false, error: error instanceof Error ? error.message : 'Email address could not be changed',
        key: null, section: 'email' as const };
    }
  }
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
export default function Profile({ loaderData: { member, deletionBlocked }, actionData }: Route.ComponentProps) {
  const runtime = useThemeRuntime();
  const profileFeedback = actionData?.section === 'profile' ? actionData : undefined;
  const emailFeedback = actionData?.section === 'email' ? actionData : undefined;
  const passwordFeedback = actionData?.section === 'password' ? actionData : undefined;
  const deleteFeedback = actionData?.section === 'delete' ? actionData : undefined;
  return <>
    <div className="page-heading"><div><p className="eyebrow">Account</p><h1>Profile</h1></div></div>
    <section className="panel form-panel"><ProfileEditor key={member.name} member={member} feedback={profileFeedback} /></section>
    <section className="panel form-panel"><EmailAddressEditor key={member.email} email={member.email} feedback={emailFeedback} /></section>
    <section className="panel form-panel"><PasswordEditor feedback={passwordFeedback} /></section>
    <section className="panel form-panel"><AppearanceSelector value={runtime.appearance} theme={themeById(runtime.themeId)} /></section>
    <section className="panel form-panel profile-danger"><DeleteAccount member={member}
      deletionBlocked={deletionBlocked} feedback={deleteFeedback} /></section>
  </>;
}
export { WorkspaceError as ErrorBoundary } from '../route-error';
