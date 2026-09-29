import { createApp } from './app.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { readEnv } from './env.js';
import { loadRootEnvFile } from './load-env.js';

loadRootEnvFile();
const env = readEnv();
const { db } = createDb(env.databaseUrl);

// Spec §7: migrations run at start, before the server listens.
const migrations = await runMigrations(db);
console.log(migrations === 'applied' ? 'Migrations applied.' : 'No migrations to apply yet.');

createApp({ db, clientDistDir: env.clientDistDir }).listen(env.port, () => {
  console.log(`Sweep server listening on http://localhost:${env.port}`);
});
