import { Form, Link, Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration, redirect, useLocation, useNavigation } from 'react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, authClient, unwrap } from './api';
import type { Route } from './+types/root';
import './style.css';
import { Icon } from './icon';

export async function clientLoader() { return unwrap(await api.me.$get()); }
export async function clientAction() {
  const result = await authClient.signOut();
  if (result.error) return { error: result.error.message ?? 'Sign-out failed' };
  return redirect('/signin');
}
export function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><head>
    <meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," /><title>Himoroki</title><Meta /><Links />
  </head><body>{children}<ScrollRestoration /><Scripts /></body></html>;
}
export function HydrateFallback() { return <main className="loading">Loading Himoroki…</main>; }
export { WorkspaceError as ErrorBoundary } from './route-error';
export default function App({ loaderData: { user, isAdmin }, actionData }: Route.ComponentProps) {
  const location = useLocation();
  const busy = useNavigation().state !== 'idle';
  const [menuOpen, setMenuOpen] = useState(false);
  const q = new URLSearchParams(location.search).get('q') ?? '';
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && user) {
        event.preventDefault(); search.current?.focus(); search.current?.select();
      }
      if (event.key === 'Escape' && document.activeElement === search.current) search.current?.blur();
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [user]);
  const assetsActive = location.pathname === '/' || location.pathname === '/asset' || location.pathname.startsWith('/assets/');
  return <div className="app-shell">
    <a className="skip-link" href="#workspace">Skip to content</a>
    <aside className="sidebar">
      <Link to="/" className="brand" onClick={() => setMenuOpen(false)} aria-label="Himoroki home">
        <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><path d="M5 27V9h6v18M21 27V9h6v18M11 5h10v6H11z" fill="currentColor" /></svg>
        <span>Himoroki<small>Identity & inventory</small></span>
      </Link>
      <button className="nav-toggle" aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen(!menuOpen)}>Navigation</button>
      <nav id="primary-navigation" aria-label="Primary" className={menuOpen ? 'expanded' : ''} onClick={() => setMenuOpen(false)}>
        <p className="nav-label">Workspace</p>
        <Link to="/" aria-current={assetsActive ? 'page' : undefined} className={assetsActive ? 'active' : ''}><Icon name="assets" />Assets</Link>
        <NavLink to="/groups"><Icon name="groups" />Groups</NavLink>
        {isAdmin && <><p className="nav-label admin-label">Administration</p><NavLink to="/administration"><Icon name="settings" />Settings</NavLink></>}
      </nav>
      <p className="sidebar-note">A place for things.<br />Context that stays.</p>
    </aside>
    <div className="app-main">
      <header className="global-header">
        <Form action="/" method="get" role="search" className="global-search">
          <input type="hidden" name="scope" value={location.pathname === '/' ? new URLSearchParams(location.search).get('scope') ?? 'all' : 'all'} />
          <label className="sr-only" htmlFor="asset-search">Search Assets by name</label>
          <Icon name="search" /><input ref={search} key={q} id="asset-search" name="q" type="search" placeholder="Search assets by name…" defaultValue={q} maxLength={200} disabled={!user} />
          <button type="button" className="search-shortcut" aria-label="Focus Asset search" aria-keyshortcuts="Meta+K Control+K" disabled={!user} onClick={() => { search.current?.focus(); search.current?.select(); }}><kbd>⌘K</kbd></button>
        </Form>
        {user ? <details className="account-menu" key={location.pathname}>
          <summary aria-label="Account menu"><span className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span><span className="account-name">{user.name}</span><span aria-hidden="true">⌄</span></summary>
          <div className="account-popover"><strong>{user.name}</strong><p>{isAdmin ? 'System administrator' : 'Signed in'}</p>
            <Form method="post" action="/"><button disabled={busy}>Sign out</button></Form>
          </div>
        </details> : <Link to="/signin" className="account-signin">Sign in</Link>}
      </header>
      <main id="workspace" tabIndex={-1} className="workspace" aria-busy={busy}>
        {actionData?.error && <p role="alert">{actionData.error}</p>}<Outlet />
      </main>
    </div>
  </div>;
}
