import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--dev')) {
  console.error('Usage: pnpm setup:env [--dev]');
  process.exitCode = 1;
} else {
  const dev = args[0] === '--dev';
  const secret = () => randomBytes(32).toString('hex');
  const values = {
    PORT: '3000',
    NEO4J_URI: 'bolt://127.0.0.1:7687',
    NEO4J_USERNAME: 'neo4j',
    NEO4J_PASSWORD: secret(),
    APP_URL: dev ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:3000',
    BETTER_AUTH_SECRET: secret(),
    S3_ENDPOINT: 'http://127.0.0.1:8080',
    S3_BUCKET: 'himoroki-photos',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: secret(),
    S3_SECRET_KEY: secret(),
    ALARIK_ADMIN_PASSWORD: secret(),
    ALARIK_JWT_SECRET: secret(),
  };
  const content = '# Local deployment configuration. Keep this file private.\n'
    + '# Credentials must match existing Neo4j and Alarik volumes.\n'
    + Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('');
  try {
    // Exclusive creation also refuses symlinks and concurrent setup attempts.
    writeFileSync('.env', content, { flag: 'wx', mode: 0o600 });
    console.log('Created .env with independent credentials. No services were started.');
    console.log('For a fresh deployment, run:');
    console.log(dev ? 'pnpm install\ndocker compose up -d --wait neo4j alarik\npnpm dev'
      : 'docker compose up -d --build --wait');
    console.log(`Open ${values.APP_URL} after startup.`);
    console.log('Existing storage volumes retain their credentials; generating a file does not rotate them.');
  } catch (error) {
    console.error(error.code === 'EEXIST'
      ? 'Refusing to overwrite .env. Keep existing credentials: a new file would not update database or object-storage volumes.'
      : 'Could not create .env. Check directory permissions and available disk space.');
    process.exitCode = 1;
  }
}
