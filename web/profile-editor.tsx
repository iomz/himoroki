import { Form, useNavigation } from 'react-router';
import type { Member } from '../server/identity-store';
import { api, unwrap } from './api';

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

export function ProfileEditor({ member, administration = false, focusName = false }: { member: Member; administration?: boolean; focusName?: boolean }) {
  const busy = useNavigation().state !== 'idle';
  return <Form method="post"><fieldset disabled={busy}>
    {administration && <input type="hidden" name="key" value={member.key} />}
    <label>Name<input name="name" defaultValue={member.name} required maxLength={200} autoComplete="name" autoFocus={focusName} /></label>
    <label>Email<input value={member.email} readOnly type="email" /></label>
    {administration && <label className="checkbox"><input name="isAdmin" type="checkbox" defaultChecked={member.isAdmin} />System administrator</label>}
    <button>Save profile</button>
  </fieldset></Form>;
}
