import { execFileSync } from 'node:child_process';
import { expect, request, test as setup } from '@playwright/test';
import {
  BASE_URL,
  E2E_PASSWORD,
  E2E_PROJECTS,
  serverEnv,
  storageStatePath,
  userEmail,
} from './support/e2e-env';

function createUser(email: string): void {
  try {
    execFileSync('pnpm', ['--filter', '@sweep/server', 'create-user', '--email', email], {
      input: `${E2E_PASSWORD}\n`,
      env: { ...process.env, ...serverEnv() },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    // A reused server (SWEEP_E2E_REUSE=1) still has the user from the last run.
    const stderr = String((err as { stderr?: Buffer }).stderr ?? '');
    if (!/already exists/.test(stderr)) throw err;
  }
}

for (const project of E2E_PROJECTS) {
  setup(`seed and sign in the ${project} user`, async () => {
    createUser(userEmail(project));
    const api = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Origin: BASE_URL },
    });
    const res = await api.post('/api/auth/sign-in/email', {
      data: { email: userEmail(project), password: E2E_PASSWORD },
    });
    expect(res.status(), await res.text()).toBe(200);
    await api.storageState({ path: storageStatePath(project) });
    await api.dispose();
  });
}
