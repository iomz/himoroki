import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import neo4j from 'neo4j-driver';

const exec = promisify(execFile);
const name = `himoroki-identity-test-${randomUUID()}`;
const password = randomUUID();
const image = process.env.NEO4J_TEST_IMAGE ?? 'neo4j:5-community';
let started = false;
let driver;
try {
  console.log(`Starting disposable Neo4j (${image})`);
  await exec('docker', ['run', '--rm', '-d', '--name', name,
    '-p', '127.0.0.1::7687', '-e', `NEO4J_AUTH=neo4j/${password}`,
    '-e', 'NEO4J_server_memory_heap_initial__size=256m',
    '-e', 'NEO4J_server_memory_heap_max__size=256m',
    '-e', 'NEO4J_server_memory_pagecache_size=128m', image]);
  started = true;
  const { stdout } = await exec('docker', ['port', name, '7687']);
  const uri = `bolt://${stdout.trim()}`;
  driver = neo4j.driver(uri, neo4j.auth.basic('neo4j', password), {
    connectionTimeout: 1000, connectionAcquisitionTimeout: 2000,
  });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { await driver.verifyConnectivity(); break; }
    catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  await driver.close();
  driver = undefined;
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', 'server/identity-store.integration.test.ts'], {
      stdio: 'inherit',
      env: { ...process.env, HIMOROKI_TEST_NEO4J_URI: uri, HIMOROKI_TEST_NEO4J_PASSWORD: password },
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await driver?.close();
  if (started) {
    await exec('docker', ['stop', name]);
    console.log('Disposable Neo4j stopped; no user database was used.');
  }
}
