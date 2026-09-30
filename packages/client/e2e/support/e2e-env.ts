import { existsSync } from 'node:fs';
import path from 'node:path';

export const E2E_PORT = 3100;
export const BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_PASSWORD = 'e2e-password-123456';

const ROOT_ENV = path.join(__dirname, '../../../../.env');
if (!process.env['DATABASE_URL'] && existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);

/** One user per (project, parallel worker slot): the server checks one guide at a time per user. */
export function userEmail(project: string, slot: number): string {
  return `e2e-${project}-w${slot}@sweep.test`;
}

export function storageStatePath(project: string, slot: number): string {
  return path.join(__dirname, `../.auth/${project}-w${slot}.json`);
}

/** DATABASE_URL's server, database `sweep_e2e` (or SWEEP_E2E_DB). Never the dev database. */
export function e2eDatabaseUrl(): string {
  const base = process.env['DATABASE_URL'];
  if (!base) {
    throw new Error(
      'e2e needs DATABASE_URL: copy .env.example to .env and run `docker compose up -d postgres`.',
    );
  }
  const url = new URL(base);
  const name = process.env['SWEEP_E2E_DB'] ?? 'sweep_e2e';
  if (!/^sweep_e2e[a-z0-9_]*$/.test(name)) {
    throw new Error(
      `e2e database "${name}" must be named sweep_e2e*; refusing to touch other databases.`,
    );
  }
  url.pathname = `/${name}`;
  return url.toString();
}

/** Environment for the e2e server process (webServer) and the create-user script. */
export function serverEnv(): Record<string, string> {
  return {
    DATABASE_URL: e2eDatabaseUrl(),
    PORT: String(E2E_PORT),
    BETTER_AUTH_URL: BASE_URL,
    BETTER_AUTH_SECRET: process.env['BETTER_AUTH_SECRET'] ?? 'e2e-only-secret-0123456789abcdef0123',
    SIGNUP_ENABLED: 'false',
    CLIENT_DIST_DIR: path.join(__dirname, '../../dist/client/browser'),
  };
}
