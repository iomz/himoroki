import { useEffect, useRef, useState } from 'react';
import { redirect, useFetcher } from 'react-router';
import { api, unwrap } from '../api';
import { ThemeSelector } from '../theme-selector';
import { TimezonePicker } from '../timezone-picker';
import type { ThemeId } from '../../shared/theme';
import type { Settings } from '../../server/settings';
import { useThemeRuntime } from '../theme-runtime';
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
    const { settings } = await unwrap(await api.settings.$patch({ json: {
      requirePhoto: data.get('requirePhoto') === 'on', displayTimezone: String(data.get('displayTimezone') ?? ''),
      themeId: String(data.get('themeId') ?? '') as ThemeId,
    } }));
    return { saved: true, error: null, settings };
  } catch (error) { return { saved: false, error: error instanceof Error ? error.message : 'Settings update failed' }; }
}
export default function Administration({ loaderData: { settings } }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof clientAction>();
  const { colorScheme, setColorSchemePreview, setThemeId } = useThemeRuntime();
  const persisted = useRef(settings);
  const previous = useRef(settings);
  const [current, setCurrent] = useState(settings);
  const [previewMode, setPreviewMode] = useState<'light' | 'dark' | null>(null);
  const busy = fetcher.state !== 'idle';
  useEffect(() => () => setColorSchemePreview(null), [setColorSchemePreview]);
  useEffect(() => {
    if (busy) return;
    persisted.current = settings;
    setCurrent(settings);
  }, [settings, busy]);
  useEffect(() => {
    if (busy || !fetcher.data) return;
    if (fetcher.data.saved && fetcher.data.settings) {
      persisted.current = fetcher.data.settings;
      setCurrent(fetcher.data.settings);
    } else if (!fetcher.data.saved) {
      persisted.current = previous.current;
      setCurrent(previous.current);
      setThemeId(previous.current.themeId);
    }
  }, [busy, fetcher.data, setThemeId]);

  function update(change: Partial<Settings>) {
    const next = { ...persisted.current, ...change };
    previous.current = persisted.current;
    setCurrent(next);
    if (change.themeId) setThemeId(next.themeId);
    void fetcher.submit({ requirePhoto: next.requirePhoto ? 'on' : '', displayTimezone: next.displayTimezone,
      themeId: next.themeId }, { method: 'post', action: '/administration' });
  }
  function preview(mode: 'light' | 'dark') {
    setPreviewMode(mode);
    setColorSchemePreview(mode);
  }
  return <>
    <div className="page-heading settings-page-heading"><div><p className="eyebrow">Administration</p>
      <div className="settings-title-row"><h1>Instance settings</h1>
        <div className="settings-save-status" aria-live="polite" aria-atomic="true">
          {busy ? <span className="settings-status-pill saving">Saving…</span>
            : fetcher.data?.error ? <span className="settings-status-pill error" role="alert"
              title={fetcher.data.error}>Error: {fetcher.data.error}</span>
              : fetcher.data?.saved ? <span className="settings-status-pill saved"><span aria-hidden="true">✓</span> Saved</span> : null}
        </div>
      </div>
      <p>Reporting policy, time presentation, and theme for this deployment.</p>
    </div>
    </div>
    <section className="panel form-panel"><h2>Reporting, display, and appearance</h2>
        <fetcher.Form method="post"><fieldset disabled={busy} aria-busy={busy}>
          <input type="hidden" name="intent" value="settings" />
          <label className="checkbox"><input type="checkbox" name="requirePhoto" checked={current.requirePhoto}
            onChange={(event) => update({ requirePhoto: event.currentTarget.checked })} />Require photo when reporting an Asset</label>
          <p className="setting-help">Applies to new Asset reports.</p>
          <TimezonePicker name="displayTimezone" value={current.displayTimezone} disabled={busy}
            onChange={(displayTimezone) => update({ displayTimezone })} />
          <p className="setting-help">Timestamps remain stored as absolute instants.</p>
          <ThemeSelector name="themeId" value={current.themeId} previewMode={previewMode ?? colorScheme} disabled={busy}
            onChange={(themeId) => update({ themeId })} onPreviewModeChange={preview} />
        </fieldset></fetcher.Form>
    </section>
  </>;
}

export { WorkspaceError as ErrorBoundary } from '../route-error';
