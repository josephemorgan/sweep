import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { loadDemoTemplates } from './demo/templates.js';
import { ensureDemoUser } from './demo/user.js';
import { readEnv } from './env.js';
import { loadRootEnvFile } from './load-env.js';

loadRootEnvFile();
const env = readEnv();
const { db, pool } = createDb(env.databaseUrl);

// Spec §7: migrations run at start, before the server listens.
const migrations = await runMigrations(db);
console.log(migrations === 'applied' ? 'Migrations applied.' : 'No migrations to apply yet.');

const auth = createAuth({
  db,
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthUrl,
  signupEnabled: env.signupEnabled,
});

let demo: Parameters<typeof createApp>[0]['demo'];
if (env.demoEnabled) {
  // Only account creation needs sign-up on; it stays off for the running app.
  const signupAuth = createAuth({
    db,
    secret: env.betterAuthSecret,
    baseURL: env.betterAuthUrl,
    signupEnabled: true,
  });
  await ensureDemoUser({ db, auth, signupAuth, secret: env.betterAuthSecret });
  const templates = await loadDemoTemplates({ timeoutMs: env.parseTimeoutMs });
  console.log(`Demo enabled: ${templates.length} sample runs.`);
  demo = { templates, secret: env.betterAuthSecret };
}

const app = createApp({
  db,
  auth,
  sameOrigin: env.betterAuthUrl,
  clientDistDir: env.clientDistDir,
  trustProxy: env.trustProxy,
  parseTimeoutMs: env.parseTimeoutMs,
  demo,
});
const server = app.listen(env.port, () => {
  console.log(`Sweep server listening on http://localhost:${env.port}`);
});

// `docker stop` sends SIGTERM: stop accepting connections, close the pool, exit.
function shutdown(): void {
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
