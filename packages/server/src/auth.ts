import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Database } from './db/client.js';
import { account, session, user, verification } from './db/auth-schema.js';

/** Spec §6 create-user rule; also Better Auth's minPasswordLength. */
export const MIN_PASSWORD_LENGTH = 12;

export interface AuthOptions {
  db: Database;
  secret: string;
  /** BETTER_AUTH_URL (an origin). Also the only trusted origin. */
  baseURL: string;
  /** Only the create-user script passes true (or SIGNUP_ENABLED=true). */
  signupEnabled: boolean;
}

function buildAuth({ db, secret, baseURL, signupEnabled }: AuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    secret,
    baseURL,
    basePath: '/api/auth',
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: !signupEnabled,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    // Our own express-rate-limit limiter covers /api/auth (spec §6.4); one limiter, one policy.
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    // Defaults already give httpOnly + SameSite=Lax. Secure follows the scheme explicitly, so
    // NODE_ENV=production on http://localhost doesn't produce cookies the browser drops.
    // Explicit false: Better Auth otherwise skips its origin check when NODE_ENV=test.
    advanced: {
      useSecureCookies: new URL(baseURL).protocol === 'https:',
      disableOriginCheck: false,
    },
  });
}

export type Auth = ReturnType<typeof buildAuth>;

export function createAuth(options: AuthOptions): Auth {
  return buildAuth(options);
}
