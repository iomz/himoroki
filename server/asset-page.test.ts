import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assetCursor, assetPageRequest } from './asset-page.js';
import { ValidationError } from './identity.js';

test('Asset page bounds and cursor preserve search, Unicode names and supported identities', () => {
  assert.deepEqual(assetPageRequest({}), { q: '', scope: 'all', limit: 30, after: null });
  for (const identifier of [
    { scheme: 'sgtin' as const, gtin: '00614141123452', serial: '001/a%?' },
    { scheme: 'grai' as const, grai: '00614141234561789' },
  ]) {
    const cursor = assetCursor('測定', { name: '測定器 — A', identifier });
    const parsed = assetPageRequest({ q: '測定', limit: '100', cursor });
    assert.equal(parsed.after?.name, '測定器 — A');
    assert.equal(parsed.after?.scheme, identifier.scheme);
    assert.equal(parsed.after?.value, identifier.scheme === 'sgtin' ? identifier.gtin : identifier.grai);
    assert.equal(parsed.after?.serial, identifier.scheme === 'sgtin' ? identifier.serial : '');
    assert.throws(() => assetPageRequest({ q: 'other', cursor }), ValidationError);
    assert.throws(() => assetPageRequest({ q: '測定', scope: 'mine', cursor }), ValidationError);
    assert.equal(assetPageRequest({ q: '測定', scope: 'mine', cursor: assetCursor('測定', { name: '測定器 — A', identifier }, 'mine') }).scope, 'mine');
  }
  for (const limit of ['', '0', '-1', '101', '1.5', 'NaN', 'Infinity']) {
    assert.throws(() => assetPageRequest({ limit }), ValidationError);
  }
  for (const cursor of ['', '%', 'null', Buffer.from(JSON.stringify({ q: '', name: 'Asset', identifier: { id: 'internal' } })).toString('base64url')]) {
    assert.throws(() => assetPageRequest({ cursor }), ValidationError);
  }
  assert.throws(() => assetPageRequest({ q: 'a'.repeat(201) }), ValidationError);
  assert.throws(() => assetPageRequest({ scope: 'owner' }), ValidationError);
});
