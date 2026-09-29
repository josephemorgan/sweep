import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Repo-root `.env`, resolved from this file (src/ or dist/), independent of the process cwd. */
export const ROOT_ENV_PATH = fileURLToPath(new URL('../../../.env', import.meta.url));

/** Loads a .env file if present. Variables already set in the environment win. */
export function loadRootEnvFile(path: string = ROOT_ENV_PATH): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
