import { hc } from 'hono/client';
import type { AppType } from '../../server/app.js';
import type { Route } from './+types/home';

export async function clientLoader() {
  try {
    const response = await hc<AppType>('/').api.ready.$get();
    return { ready: response.ok && (await response.json()).status === 'ready' };
  } catch {
    return { ready: false };
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <main>
    <h1>Himoroki</h1>
    <p>Identity and context for physical assets.</p>
    <p role="status">{loaderData.ready ? 'Service ready.' : 'Service unavailable.'}</p>
  </main>;
}
