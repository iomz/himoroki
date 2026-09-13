import { Hono } from 'hono';

export function createApp(checkDatabase: () => Promise<void>) {
  return new Hono()
    .get('/api/health', (c) => c.json({ status: 'ok' } as const))
    .get('/api/ready', async (c) => {
      try {
        await checkDatabase();
        return c.json({ status: 'ready' } as const);
      } catch {
        return c.json({ status: 'unavailable' } as const, 503);
      }
    });
}

export type AppType = ReturnType<typeof createApp>;
