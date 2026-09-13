import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getConnInfo } from '@hono/node-server/conninfo';
import neo4j from 'neo4j-driver';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { IdentityStore } from './identity-store.js';
import { createInventoryApi } from './inventory-api.js';

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
const appURL = process.env.APP_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
if (!appURL || !authSecret) throw new Error('APP_URL and BETTER_AUTH_SECRET are required');
const store = await IdentityStore.open(driver);
const auth = await createAuth(driver, appURL, authSecret);
app.use('/api/*', async (c, next) => {
  c.req.raw.headers.delete('x-himoroki-client-ip');
  const address = getConnInfo(c).remote.address;
  if (address) c.req.raw.headers.set('x-himoroki-client-ip', address);
  await next();
});
app.route('/api', createInventoryApi(store, auth, new URL(appURL).origin));

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
