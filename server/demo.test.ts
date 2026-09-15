import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { canonicalIdentifier } from './identity.js';
import { demoAssets, evaluatorScopes } from '../scripts/demo/fixtures.js';
import { demoConfiguration, requireStoppedApp, requireUnversionedBucket } from '../scripts/demo/safety.js';

const env = { HIMOROKI_DEMO: 'local', NODE_ENV: 'development', APP_URL: 'http://127.0.0.1:3000',
  NEO4J_URI: 'bolt://127.0.0.1:7687', NEO4J_PASSWORD: 'test', S3_ENDPOINT: 'http://127.0.0.1:8080',
  S3_BUCKET: 'himoroki-photos', S3_ACCESS_KEY: 'test', S3_SECRET_KEY: 'test', BETTER_AUTH_SECRET: 'x'.repeat(32) };

test('demo contents and supported identifiers are deterministic with overlapping scopes', () => {
  const assets = demoAssets();
  assert.deepEqual(assets, demoAssets());
  assert.equal(assets.length, 140);
  assert.equal(new Set(assets.map((asset) => JSON.stringify(canonicalIdentifier(asset.identifier)))).size, 140);
  assert.equal(assets.filter((a) => a.identifier.scheme === 'sgtin').length, 70);
  assert.equal(assets.filter((a) => a.identifier.scheme === 'grai').length, 70);
  const readable = assets.filter((a) => a.group !== 3 || a.isPublic);
  assert.deepEqual({ all: readable.length, mine: readable.filter((a) => a.reporter === 0).length,
    group: readable.filter((a) => a.group !== 3).length, public: readable.filter((a) => a.isPublic).length }, evaluatorScopes);
  assert.ok(readable.some((a) => a.reporter === 0 && a.isPublic));
  assert.ok(assets.some((a) => a.owner === null));
  assert.ok(assets.some((a) => a.owner !== null));
  assert.equal(assets.filter((a) => a.photo).length, 47);
});

test('demo safety requires explicit opt-in, loopback configuration and exact destructive confirmation', () => {
  assert.doesNotThrow(() => demoConfiguration('seed', [], env));
  assert.doesNotThrow(() => demoConfiguration('reset', ['--', '--yes'], env));
  for (const args of [[], ['yes'], ['--yes', '--yes'], ['--force'], ['--', '--yes', 'extra']]) {
    assert.throws(() => demoConfiguration('reset', args, env));
  }
  for (const change of [
    { HIMOROKI_DEMO: undefined }, { HIMOROKI_DEMO: 'true' }, { NODE_ENV: 'production' }, { NODE_ENV: 'staging' },
    { APP_URL: 'https://demo.example.com' }, { APP_URL: 'http://0.0.0.0:3000' },
    { NEO4J_URI: 'neo4j://127.0.0.1:7687' }, { NEO4J_URI: 'bolt://neo4j:7687' },
    { NEO4J_URI: 'bolt://127.0.0.1.evil.example:7687' }, { NEO4J_URI: 'bolt://user:password@127.0.0.1:7687' },
    { S3_ENDPOINT: 'http://192.168.1.2:8080' }, { S3_ENDPOINT: 'https://s3.example.com' },
    { S3_ENDPOINT: 'http://localhost:8080/path' }, { S3_BUCKET: 'other-bucket' }, { NEO4J_PASSWORD: '' },
  ]) assert.throws(() => demoConfiguration('reset', ['--yes'], { ...env, ...change }));
});

test('demo refuses a running local application before connecting to persistence', async () => {
  const server = createServer((_req, res) => { res.writeHead(404); res.end(); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = new URL(`http://127.0.0.1:${address.port}`);
  try { await assert.rejects(requireStoppedApp(url, address.port), /Stop the local application/); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  await assert.doesNotReject(requireStoppedApp(url, address.port));
});

test('demo refuses buckets that could retain hidden media versions', () => {
  assert.doesNotThrow(() => requireUnversionedBucket(undefined));
  for (const status of ['Enabled', 'Suspended', 'unknown']) assert.throws(() => requireUnversionedBucket(status));
});
