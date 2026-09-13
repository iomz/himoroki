import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';

test('liveness does not require a database connection', async () => {
  const app = createApp(async () => { throw new Error('database offline'); });
  const response = await app.request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('readiness reflects database availability without exposing errors', async () => {
  let available = false;
  const app = createApp(async () => {
    if (!available) throw new Error('private connection details');
  });
  const unavailable = await app.request('/api/ready');
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { status: 'unavailable' });
  available = true;
  const ready = await app.request('/api/ready');
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ready' });
});
