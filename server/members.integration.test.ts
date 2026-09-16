import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Hono } from 'hono';
import neo4j from 'neo4j-driver';
import { createAuth } from './auth.js';
import { IdentityStore } from './identity-store.js';
import { createInventoryApi } from './inventory-api.js';

const uri = process.env.HIMOROKI_TEST_NEO4J_URI;
const password = process.env.HIMOROKI_TEST_NEO4J_PASSWORD;
test('member administration and shared profiles', { skip: !uri || !password }, async (t) => {
  const driver = neo4j.driver(uri!, neo4j.auth.basic('neo4j', password!));
  t.after(() => driver.close());
  const store = await IdentityStore.open(driver);
  const origin = 'http://localhost:3000';
  const auth = await createAuth(driver, origin, randomUUID() + randomUUID());
  const app = new Hono().route('/api', createInventoryApi(store, auth, origin));
  function client(peer: number) {
    let cookie = '';
    return async (path: string, method = 'GET', body?: unknown) => {
      const response = await app.request(origin + '/api' + path, { method,
        headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'x-himoroki-client-ip': `192.0.2.${peer}` },
        body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ');
      return response;
    };
  }
  const admin = client(1), other = client(2), anonymous = client(3);
  const keys: string[] = [];
  for (const [index, caller] of [admin, other].entries()) {
    const response = await caller('/auth/sign-up/email', 'POST', { name: `Member ${index}`, email: `member${index}@example.com`, password: 'test-password-12345' });
    assert.equal(response.status, 200);
    keys.push((await (await caller('/me')).json()).user.key);
  }
  const session = driver.session();
  await session.run('MATCH (u:User {key: $key}) SET u.isAdmin = true', { key: keys[0] });
  await session.close();
  const group = await store.createReportingGroup('Private team', keys[0]);
  const identifier = { scheme: 'sgtin' as const, gtin: '00614141123452', serial: 'PROFILE-TEST' };
  const asset = await store.reportAsset({ name: 'Private instrument', identifiers: [identifier] }, { actorKey: keys[0], groupKey: group.key });

  await t.test('registered members only; creation time available; privileged endpoints reject non-admins', async () => {
    const response = await admin('/members');
    assert.equal(response.status, 200);
    const { members } = await response.json();
    assert.equal(members.length, 2);
    assert.ok(members.every((u: { createdAt: string }) => Number.isFinite(Date.parse(u.createdAt))));
    assert.equal((await other('/members')).status, 403);
    assert.equal((await anonymous('/members')).status, 401);
    assert.equal((await other('/members/' + keys[0], 'PATCH', { name: 'Forbidden', isAdmin: true })).status, 403);
  });
  await t.test('shared name editing preserves identity and does not expose authentication fields', async () => {
    assert.equal((await admin('/members/' + keys[1], 'PATCH', { name: 'Admin renamed', isAdmin: false })).status, 200);
    assert.equal((await (await other('/me')).json()).user.name, 'Admin renamed');
    assert.equal((await other('/profile', 'PATCH', { name: 'Self renamed' })).status, 200);
    assert.equal((await (await other('/me')).json()).user.name, 'Self renamed');
    for (const extra of [{ key: keys[0] }, { email: 'changed@example.com' }, { isAdmin: true }, { password: 'changed-password' }]) {
      assert.equal((await other('/profile', 'PATCH', { name: 'Bad', ...extra })).status, 400);
    }
    assert.equal((await admin('/members/' + keys[1], 'PATCH', { name: 'Bad', isAdmin: false, email: 'changed@example.com' })).status, 400);
    assert.equal((await other('/auth/update-user', 'POST', { name: 'Bypass' })).status, 404);
    await assert.rejects(store.updateMember(keys[1], keys[0], { name: 'Forbidden', isAdmin: true }));
    assert.equal((await admin('/profile', 'PATCH', { name: 'Reporter renamed' })).status, 200);
    const updated = await store.getAsset(identifier, keys[0]);
    assert.equal(updated?.reportedBy.key, asset.reportedBy.key);
    assert.equal(updated?.reportedBy.name, 'Reporter renamed');
    assert.equal(updated?.reportedAt, asset.reportedAt);
    assert.equal((await (await other('/profile')).json()).member.email, 'member1@example.com');
  });
  await t.test('grant/revoke preserves Asset authorization; final admin protection is atomic', async () => {
    const path = '/members/' + keys[1];
    assert.equal((await admin(path, 'PATCH', { name: 'Second admin', isAdmin: true })).status, 200);
    assert.equal(await store.getAsset(identifier, keys[1]), null);
    await assert.rejects(store.updateAsset(identifier, { name: 'Forbidden' }, keys[1]));
    assert.equal((await admin(path, 'PATCH', { name: 'Member again', isAdmin: false })).status, 200);
    assert.equal((await admin('/members/' + keys[0], 'PATCH', { name: 'Must roll back', isAdmin: false })).status, 409);
    assert.equal((await store.profile(keys[0])).name, 'Reporter renamed');
    await admin(path, 'PATCH', { name: 'Second admin', isAdmin: true });
    const responses = await Promise.all([
      admin('/members/' + keys[0], 'PATCH', { name: 'First', isAdmin: false }),
      other(path, 'PATCH', { name: 'Second', isAdmin: false }),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const profiles = await Promise.all(keys.map((key) => store.profile(key)));
    assert.equal(profiles.filter((p) => p.isAdmin).length, 1);
    const demoted = profiles.findIndex((p) => !p.isAdmin);
    assert.equal((await [admin, other][demoted]('/members')).status, 403);
  });
});
