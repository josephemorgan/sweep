import { execFileSync } from 'node:child_process';
import { expect, request } from '@playwright/test';
import { BASE_URL, E2E_PASSWORD, serverEnv } from './e2e-env';

/** Creates the account with the real create-user script. "Already exists" is fine (reused server). */
export function createUser(email: string): void {
  try {
    execFileSync('pnpm', ['--filter', '@sweep/server', 'create-user', '--email', email], {
      input: `${E2E_PASSWORD}\n`,
      env: { ...process.env, ...serverEnv() },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = String((err as { stderr?: Buffer }).stderr ?? '');
    if (!/already exists/.test(stderr)) throw err;
  }
}

/** ONE API sign-in (one auth-limiter request); saves the session to `file`. */
export async function signInToFile(email: string, file: string): Promise<void> {
  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: BASE_URL },
  });
  const res = await api.post('/api/auth/sign-in/email', {
    data: { email, password: E2E_PASSWORD },
  });
  expect(res.status(), await res.text()).toBe(200);
  await api.storageState({ path: file });
  await api.dispose();
}
