import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs from packages/server; the repo-root .env is two levels up.
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env['DATABASE_URL'] ?? '' },
});
