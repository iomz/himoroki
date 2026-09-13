import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import neo4j from 'neo4j-driver';
import { createApp } from './app.js';

const password = process.env.NEO4J_PASSWORD;
if (!password) throw new Error('NEO4J_PASSWORD is required');

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const driver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687',
  neo4j.auth.basic(process.env.NEO4J_USERNAME ?? 'neo4j', password),
  { connectionTimeout: 5000, connectionAcquisitionTimeout: 5000 },
);
const app = createApp(async () => { await driver.verifyConnectivity(); });

// Unknown API paths must never fall through to the SPA.
app.all('/api', (c) => c.json({ error: 'Not found' }, 404));
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
app.use('/assets/*', serveStatic({ root: './build/client' }));
app.all('/assets/*', (c) => c.notFound());
app.get('*', serveStatic({ path: './build/client/index.html' }));

const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(async () => { await driver.close(); });
  });
}
