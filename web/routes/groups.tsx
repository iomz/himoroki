import { Form, redirect, useNavigation } from 'react-router';
import { api, unwrap } from '../api';
import type { Route } from './+types/groups';

export async function clientLoader() {
  const { user } = await unwrap(await api.me.$get());
  if (!user) throw redirect('/signin');
  const { groups } = await unwrap(await api.groups.$get());
  return { user, groups };
}
export async function clientAction({ request }: Route.ClientActionArgs) {
  const data = await request.formData();
  const text = (key: string) => String(data.get(key) ?? '');
  try {
    switch (text('intent')) {
      case 'group':
        await unwrap(await api.groups.$post({ json: { name: text('name') } }));
        break;
      case 'member':
        await unwrap(await api.groups[':key'].members.$post({ param: { key: text('groupKey') }, json: { userKey: text('userKey') } }));
        break;
      case 'leave':
        await unwrap(await api.groups[':key'].membership.$delete({ param: { key: text('groupKey') } }));
        break;

      default: throw new Error('Unknown action');
    }
    return redirect('/groups');
  } catch (error) { return { error: error instanceof Error ? error.message : 'Group update failed' }; }
}
export default function Groups({ loaderData: { user, groups }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== 'idle';
  return <>
    <div className="page-heading"><div><p className="eyebrow">Collaboration</p><h1>Groups</h1><p>Manage the people you share Asset access with.</p></div></div>
    {actionData?.error && <p role="alert">{actionData.error}</p>}
      <section className="panel">
        <h2>Your Groups</h2>
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

  </>;
}

export { WorkspaceError as ErrorBoundary } from '../route-error';
