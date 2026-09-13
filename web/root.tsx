import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { ReactNode } from 'react';
import './style.css';

export function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <title>Himoroki</title><Meta /><Links />
  </head><body>{children}<ScrollRestoration /><Scripts /></body></html>;
}

export function HydrateFallback() { return <main>Loading Himoroki…</main>; }
export default function App() { return <Outlet />; }
