import type { DemoSignInResponseDto } from '@sweep/core';
import type { Express } from 'express';
import request from 'supertest';
import { createApp, type AppOptions } from '../../src/app.js';
import { createAuth, type Auth } from '../../src/auth.js';
import type { Database } from '../../src/db/client.js';
import { RATE_LIMITS, type RateLimits } from '../../src/limits.js';
import { ensureDemoUser } from '../../src/demo/user.js';
import { createUser } from '../../src/scripts/create-user.js';
import { createTestDb, type TestDb } from './test-db.js';

export const TEST_ORIGIN = 'http://localhost:4200';
export const TEST_SECRET = 'sweep-test-secret-0123456789abcdef0123456789';
export const TEST_PASSWORD = 'test-password-123';

/** High limits so ordinary tests never trip them; rate-limit tests override one rule. */
export const TEST_RATE_LIMITS: RateLimits = {
  auth: { ...RATE_LIMITS.auth, limit: 1_000 },
  uploads: { ...RATE_LIMITS.uploads, limit: 1_000 },
  api: { ...RATE_LIMITS.api, limit: 10_000 },
};

type Agent = ReturnType<typeof request.agent>;
export type AgentRequest = ReturnType<Agent['get']>;

/** A cookie-keeping supertest agent that always sends `Origin` (the same-origin guard needs it). */
export interface OriginAgent {
  get(url: string): AgentRequest;
  post(url: string): AgentRequest;
  put(url: string): AgentRequest;
  patch(url: string): AgentRequest;
  delete(url: string): AgentRequest;
}

export function withOrigin(agent: Agent, origin: string): OriginAgent {
  return {
    get: (url) => agent.get(url).set('Origin', origin),
    post: (url) => agent.post(url).set('Origin', origin),
    put: (url) => agent.put(url).set('Origin', origin),
    patch: (url) => agent.patch(url).set('Origin', origin),
    delete: (url) => agent.delete(url).set('Origin', origin),
  };
}

export interface SignedIn {
  agent: OriginAgent;
  userId: string;
}

export type ContextOptions = Partial<Omit<AppOptions, 'db' | 'auth' | 'sameOrigin'>> & {
  /** BETTER_AUTH_URL for this context. Default TEST_ORIGIN. */
  origin?: string;
};

export interface TestContext {
  testDb: TestDb;
  db: Database;
  auth: Auth;
  /** A sign-up-enabled Better Auth instance, as the create-user script builds. */
  scriptAuth: Auth;
  app: Express;
  origin: string;
  /** Creates an account (as the create-user script does) and returns its user id. */
  createUser(email: string): Promise<string>;
  signedInAgent(email: string): Promise<SignedIn>;
  /** A guest signed in through POST /api/demo/sign-in (needs the `demo` option). */
  demoAgent(): Promise<SignedIn>;
  close(): Promise<void>;
}

export async function createTestContext(options: ContextOptions = {}): Promise<TestContext> {
  const { origin = TEST_ORIGIN, rateLimits, ...appOptions } = options;
  const testDb = await createTestDb();
  const authOptions = { db: testDb.db, secret: TEST_SECRET, baseURL: origin };
  const auth = createAuth({ ...authOptions, signupEnabled: false });
  // Only the create-user script builds a sign-up-enabled instance; tests mirror that.
  const scriptAuth = createAuth({ ...authOptions, signupEnabled: true });
  const app = createApp({
    db: testDb.db,
    auth,
    sameOrigin: origin,
    ...appOptions,
    rateLimits: { ...TEST_RATE_LIMITS, ...rateLimits },
  });

  if (appOptions.demo) {
    await ensureDemoUser({
      db: testDb.db,
      auth,
      signupAuth: scriptAuth,
      secret: appOptions.demo.secret,
    });
  }

  async function addUser(email: string): Promise<string> {
    const name = email.split('@')[0] ?? email;
    const created = await createUser(scriptAuth, { email, name, password: TEST_PASSWORD });
    return created.id;
  }

  return {
    testDb,
    db: testDb.db,
    auth,
    scriptAuth,
    app,
    origin,
    createUser: addUser,
    async signedInAgent(email) {
      const userId = await addUser(email);
      const agent = withOrigin(request.agent(app), origin);
      const res = await agent
        .post('/api/auth/sign-in/email')
        .send({ email, password: TEST_PASSWORD });
      if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${res.text}`);
      return { agent, userId };
    },
    async demoAgent() {
      const agent = withOrigin(request.agent(app), origin);
      const res = await agent.post('/api/demo/sign-in');
      if (res.status !== 200) throw new Error(`demo sign-in failed: ${res.status} ${res.text}`);
      return { agent, userId: (res.body as DemoSignInResponseDto).user.id };
    },
    close: () => testDb.drop(),
  };
}

/** An app on a database that may be unreachable (health/static tests). No test DB is created. */
export function offlineApp(
  db: Database,
  options: Partial<Omit<AppOptions, 'db' | 'auth' | 'sameOrigin'>> = {},
): Express {
  const auth = createAuth({ db, secret: TEST_SECRET, baseURL: TEST_ORIGIN, signupEnabled: false });
  return createApp({ db, auth, sameOrigin: TEST_ORIGIN, rateLimits: TEST_RATE_LIMITS, ...options });
}
