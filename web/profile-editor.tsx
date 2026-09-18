import { Form, useNavigation } from 'react-router';
import { useEffect, useState } from 'react';
import type { Member } from '../server/identity-store';
import { api, unwrap } from './api';

type FormFeedback = { saved: boolean; error: string | null } | undefined;

function FormStatus({ feedback, savedLabel }: { feedback: FormFeedback; savedLabel: string }) {
  return <div className="profile-action-status" role="status" aria-live="polite" aria-atomic="true">
    {feedback?.saved ? <span className="settings-status-pill saved"><span aria-hidden="true">✓</span> {savedLabel}</span>
      : feedback?.error ? <span className="settings-status-pill error" role="alert">{feedback.error}</span> : null}
  </div>;
}

export async function saveProfile(request: Request, administration = false) {
  const data = await request.formData();
  const name = String(data.get('name') ?? '');
  const key = administration ? String(data.get('key') ?? '') : null;
  try {
    if (administration) {
      await unwrap(await api.members[':key'].$patch({ param: { key: key! }, json: { name, isAdmin: data.get('isAdmin') === 'on' } }));
    } else await unwrap(await api.profile.$patch({ json: { name } }));
    return { saved: true, error: null, key };
  } catch (error) { return { saved: false, error: error instanceof Error ? error.message : 'Profile update failed', key }; }
}

export function ProfileEditor({ member, administration = false, focusName = false, feedback }: {
  member: Member; administration?: boolean; focusName?: boolean; feedback?: FormFeedback;
}) {
  const busy = useNavigation().state !== 'idle';
  return <Form method="post"><fieldset disabled={busy}>
    {administration && <input type="hidden" name="key" value={member.key} />}
    <label>Name<input name="name" defaultValue={member.name} required maxLength={200} autoComplete="name" autoFocus={focusName} /></label>
    {administration && <label>Email<input value={member.email} readOnly type="email" /></label>}
    {administration && <label className="checkbox"><input name="isAdmin" type="checkbox" defaultChecked={member.isAdmin} />System administrator</label>}
    {administration ? <button>Save profile</button> : <div className="profile-action-row"><button>Save profile</button>
      <FormStatus feedback={feedback} savedLabel="Saved" /></div>}
  </fieldset></Form>;
}

export function EmailAddressEditor({ email, feedback }: { email: string; feedback?: FormFeedback }) {
  const busy = useNavigation().state !== 'idle';
  return <Form method="post"><fieldset disabled={busy}>
    <input type="hidden" name="intent" value="email" />
    <h2>Email address</h2>
    <p className="hint">Changing email immediately updates your sign-in address and password-recovery destination.</p>
    <label>Email<input name="newEmail" defaultValue={email} required maxLength={254} type="email" autoComplete="email" /></label>
    <label>Current password<input name="currentPassword" required type="password" autoComplete="current-password" /></label>
    <div className="profile-action-row"><button>Change email</button>
      <FormStatus feedback={feedback} savedLabel="Changed" /></div>
  </fieldset></Form>;
}

export function PasswordEditor({ feedback }: { feedback?: FormFeedback }) {
  const busy = useNavigation().state !== 'idle';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    if (!feedback?.saved) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
  }, [feedback]);
  return <Form method="post"><fieldset disabled={busy}>
    <input type="hidden" name="intent" value="password" />
    <h2>Password</h2>
    <p className="hint">Changing your password signs out your other sessions.</p>
    <label>Current password<input name="currentPassword" required type="password" autoComplete="current-password"
      value={currentPassword} onChange={(event) => setCurrentPassword(event.currentTarget.value)} /></label>
    <label>New password<input name="newPassword" required type="password" minLength={12} maxLength={128}
      autoComplete="new-password" value={newPassword}
      onChange={(event) => setNewPassword(event.currentTarget.value)} /></label>
    <label>Confirm new password<input name="confirmation" required type="password" minLength={12} maxLength={128}
      autoComplete="new-password" value={confirmation}
      onChange={(event) => setConfirmation(event.currentTarget.value)} /></label>
    <p className="hint">Use at least 12 characters.</p>
    <div className="profile-action-row"><button>Change password</button>
      <FormStatus feedback={feedback} savedLabel="Changed" /></div>
  </fieldset></Form>;
}
