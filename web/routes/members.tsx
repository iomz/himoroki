import { useEffect, useRef, useState } from 'react';
import { redirect } from 'react-router';
import { api, unwrap } from '../api';
import { ProfileEditor, saveProfile } from '../profile-editor';
import { displayInstant } from '../../server/settings';
import { filterMembers } from '../member-filter';
import type { Member } from '../../server/identity-store';
import type { Route } from './+types/members';

export async function clientLoader() {
  const response = await api.members.$get();
  if (response.status === 401) throw redirect('/signin');
  if (response.status === 403) throw new Response('Administrator access required.', { status: 403 });
  const { members } = await unwrap(response);
  const { settings } = await unwrap(await api.settings.$get());
  return { members, settings };
}
export async function clientAction({ request }: Route.ClientActionArgs) { return saveProfile(request, true); }

function MemberDialog({ member, actionData, onDismiss }: { member: Member; actionData: Route.ComponentProps['actionData']; onDismiss(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    return () => { if (dialog.current?.open) dialog.current.close(); };
  }, []);
  return <dialog ref={dialog} className="member-dialog" aria-labelledby="member-dialog-title"
    onCancel={(event) => { event.preventDefault(); dialog.current?.close(); }}
    onClose={onDismiss}>
    <div className="member-dialog-card">
      <div className="member-dialog-heading">
        <div><p className="eyebrow">Member profile</p><h2 id="member-dialog-title">Edit {member.name}</h2></div>
        <button type="button" className="dialog-close" aria-label="Close member editor" onClick={() => dialog.current?.close()}>×</button>
      </div>
      {actionData?.key === member.key && actionData.error && <p role="alert">{actionData.error}</p>}
      {actionData?.key === member.key && actionData.saved && <p role="status" className="notice">Profile saved.</p>}
      <ProfileEditor key={member.key + member.name + member.isAdmin} member={member} administration focusName />
    </div>
  </dialog>;
}

export default function Members({ loaderData: { members, settings }, actionData }: Route.ComponentProps) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const matching = filterMembers(members, query);
  const selected = members.find((member) => member.key === selectedKey) ?? null;
  return <>
    <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>Members</h1><p>{members.length} registered members</p></div></div>
    <div className="member-toolbar">
      <label htmlFor="member-search" className="sr-only">Search members by name or email</label>
      <input id="member-search" type="search" placeholder="Search members by name or email…" value={query}
        onChange={(event) => setQuery(event.currentTarget.value)} autoComplete="off" />
      {query && <span aria-live="polite">{matching.length} matching</span>}
    </div>
    {matching.length ? <div className="member-table-frame"><table className="member-table">
      <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th></tr></thead>
      <tbody>{matching.map((member) => <tr key={member.key}>
        <td data-label="Name"><button type="button" className="member-name-button" onClick={() => setSelectedKey(member.key)}>{member.name}</button></td>
        <td data-label="Email">{member.email}</td>
        <td data-label="Joined">{member.createdAt
          ? <time dateTime={member.createdAt}>{displayInstant(member.createdAt, settings.displayTimezone)}</time>
          : <span aria-label="Unknown">—</span>}</td>
        <td data-label="Role"><span className={'member-role badge' + (member.isAdmin ? ' administrator' : '')}>{member.isAdmin ? 'System administrator' : 'Member'}</span></td>
      </tr>)}</tbody>
    </table></div> : <div className="empty-state member-empty"><p>No members match “{query.trim()}”.</p></div>}
    {selected && <MemberDialog member={selected} actionData={actionData} onDismiss={() => setSelectedKey(null)} />}
  </>;
}
export { WorkspaceError as ErrorBoundary } from '../route-error';
