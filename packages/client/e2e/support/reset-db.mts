// Drops and recreates the e2e database before the e2e server starts (playwright.config.ts webServer).
import pg from 'pg';

const raw = process.env['DATABASE_URL'];
if (!raw) throw new Error('reset-db: DATABASE_URL is not set');
const target = new URL(raw);
const name = target.pathname.slice(1);
if (!/^sweep_e2e[a-z0-9_]*$/.test(name)) {
  throw new Error(`reset-db: refusing to reset "${name}"; e2e databases are named sweep_e2e*`);
}
const admin = new URL(raw);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
try {
  await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${name}`);
} finally {
  await client.end();
}
console.log(`reset-db: recreated ${name}`);
