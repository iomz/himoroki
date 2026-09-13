import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { validator } from 'hono/validator';
import type { Auth } from './auth.js';
import { canonicalIdentifier, record, requiredText, ValidationError } from './identity.js';
import { DuplicateIdentityError, ReferenceError, type IdentityStore, type AssetChanges, type ReportAsset } from './identity-store.js';

type User = { key: string; name: string };
type Env = { Variables: { user: User | null } };
const authPaths = new Set(['/api/auth/sign-up/email', '/api/auth/sign-in/email', '/api/auth/sign-out', '/api/auth/get-session']);
function actor(user: User | null) {
  if (!user) throw new HTTPException(401, { message: 'Sign in required' });
  return user.key;
}

export function createInventoryApi(store: IdentityStore, auth: Auth, origin: string) {
  return new Hono<Env>()
    .use('*', async (c, next) => {
      c.header('Cache-Control', 'no-store');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('Origin') !== origin) {
        return c.json({ error: 'Request origin not allowed' }, 403);
      }
      await next();
    })
    .use('*', bodyLimit({ maxSize: 16384 }))
    .all('/auth/*', (c) => authPaths.has(new URL(c.req.url).pathname)
      ? auth.handler(c.req.raw) : c.json({ error: 'Not found' }, 404))
    .use('*', async (c, next) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      const key = session?.user.key;
      if (session && !key) throw new Error('Authenticated User has no domain key');
      c.set('user', session && key ? { key, name: session.user.name } : null);
      await next();
    })
    .get('/me', (c) => c.json({ user: c.get('user') }))
    .get('/groups', async (c) => c.json({ groups: await store.listGroups(actor(c.get('user'))) }))
    .post('/groups', validator('json', (value) => {
      const input = record(value, ['name']);
      return { name: requiredText(input.name, 'name') };
    }), async (c) => c.json({ group: await store.createReportingGroup(c.req.valid('json').name, actor(c.get('user'))) }, 201))
    .post('/groups/:key/members', validator('json', (value) => {
      const input = record(value, ['userKey']);
      return { userKey: requiredText(input.userKey, 'userKey') };
    }), async (c) => {
      await store.addGroupMember(actor(c.get('user')), c.req.param('key'), c.req.valid('json').userKey);
      return c.json({ ok: true });
    })
    .delete('/groups/:key/membership', async (c) => {
      await store.leaveGroup(actor(c.get('user')), c.req.param('key'));
      return c.json({ ok: true });
    })
    .get('/assets', async (c) => {
      const key = actor(c.get('user'));
      const text = c.req.query('q') ?? '';
      if (text.length > 200) throw new ValidationError('Search is limited to 200 characters');
      return c.json({ assets: await store.findAssets(key, text) });
    })
    .post('/assets', validator('json', (value) => {
      const input = record(value, ['name', 'identifiers', 'ownerKey', 'groupKey']);
      return { ...input, groupKey: requiredText(input.groupKey, 'groupKey') } as ReportAsset & { groupKey: string };
    }), async (c) => {
      const actorKey = actor(c.get('user'));
      const { groupKey, ...report } = c.req.valid('json');
      const asset = await store.reportAsset(report, { actorKey, groupKey });
      return c.json({ asset }, 201);
    })
    .get('/asset', validator('query', canonicalIdentifier), async (c) => {
      const user = c.get('user');
      const asset = await store.getAsset(c.req.valid('query'), user?.key ?? null);
      if (!asset) return c.json({ error: 'Asset not found' }, 404);
      const groups = user ? await store.listGroups(user.key) : [];
      return c.json({ asset, canEdit: groups.some((g) => asset.groups.some((access) => access.key === g.key)) });
    })
    .patch('/asset', validator('query', canonicalIdentifier), validator('json', (value) =>
      record(value, ['name', 'ownerKey', 'isPublic']) as AssetChanges), async (c) => {
      const asset = await store.updateAsset(c.req.valid('query'), c.req.valid('json'), actor(c.get('user')));
      return c.json({ asset });
    })
    .onError((error, c) => {
      if (error instanceof ValidationError) return c.json({ error: error.message }, 400);
      if (error instanceof ReferenceError) return c.json({ error: 'Resource or Group access not found' }, 404);
      if (error instanceof DuplicateIdentityError) return c.json({ error: error.message }, 409);
      if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
      console.error('Inventory request failed', error);
      return c.json({ error: 'Request failed' }, 500);
    });
}
export type InventoryApi = ReturnType<typeof createInventoryApi>;
