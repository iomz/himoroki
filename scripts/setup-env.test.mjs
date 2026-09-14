import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { test } from 'node:test';

const script = fileURLToPath(new URL('./setup-env.mjs', import.meta.url));
const template = parseEnv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'));
const credentials = ['NEO4J_PASSWORD', 'BETTER_AUTH_SECRET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'ALARIK_ADMIN_PASSWORD', 'ALARIK_JWT_SECRET'];
function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'himoroki-env-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(cwd, ...args) { return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' }); }

for (const dev of [false, true]) {
  test(`generates complete ${dev ? 'development' : 'Compose'} configuration privately`, (t) => {
    const dir = directory(t);
    const result = run(dir, ...(dev ? ['--dev'] : []));
    assert.equal(result.status, 0, result.stderr);
    const env = parseEnv(readFileSync(join(dir, '.env'), 'utf8'));
    assert.deepEqual(Object.keys(env).sort(), Object.keys(template).sort());
    assert.equal(env.APP_URL, `http://127.0.0.1:${dev ? 5173 : 3000}`);
    for (const key of Object.keys(template).filter((key) => !credentials.includes(key) && key !== 'APP_URL')) {
      assert.equal(env[key], template[key]);
    }
    assert.equal(new Set(credentials.map((key) => env[key])).size, credentials.length);
    for (const key of credentials) {
      assert.match(env[key], /^[a-f0-9]{64}$/);
      assert.ok(!(result.stdout + result.stderr).includes(env[key]));
    }
    if (process.platform !== 'win32') assert.equal(statSync(join(dir, '.env')).mode & 0o777, 0o600);
    assert.ok(result.stdout.includes(dev ? 'pnpm dev' : 'docker compose up -d --build --wait'));
    const other = directory(t);
    assert.equal(run(other).status, 0);
    const second = parseEnv(readFileSync(join(other, '.env'), 'utf8'));
    for (const key of credentials) assert.notEqual(env[key], second[key]);
  });
}

test('refuses existing configuration without changing bytes or permissions', (t) => {
  const dir = directory(t);
  const path = join(dir, '.env');
  writeFileSync(path, 'KEEP=existing\n', { mode: 0o640 });
  const mode = statSync(path).mode;
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to overwrite/);
  assert.equal(readFileSync(path, 'utf8'), 'KEEP=existing\n');
  assert.equal(statSync(path).mode, mode);
});

test('refuses a symlink without touching its target', { skip: process.platform === 'win32' }, (t) => {
  const dir = directory(t);
  const target = join(dir, 'existing');
  writeFileSync(target, 'unchanged');
  symlinkSync(target, join(dir, '.env'));
  assert.equal(run(dir).status, 1);
  assert.equal(readFileSync(target, 'utf8'), 'unchanged');
});

test('rejects unsupported or repeated options before writing', (t) => {
  const dir = directory(t);
  for (const args of [['--force'], ['--dev', '--dev'], ['unexpected']]) {
    assert.equal(run(dir, ...args).status, 1);
    assert.equal(existsSync(join(dir, '.env')), false);
  }
});
