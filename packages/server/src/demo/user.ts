// The shared demo account (spec §6.6). Its password is derived from the server secret, so it is
// never stored in plain text and the operator never needs to know it.
import { createHmac } from 'node:crypto';
import { DEMO_USER_EMAIL, DEMO_USER_NAME } from '@sweep/core';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import type { Auth } from '../auth.js';
import type { Database } from '../db/client.js';
import { session, user } from '../db/schema.js';
import { createUser } from '../scripts/create-user.js';

/** 64 hex characters, deterministic for a given secret. */
export function demoPassword(secret: string): string {
  return createHmac('sha256', secret).update('sweep-demo-user').digest('hex');
}

export interface EnsureDemoUserOptions {
  db: Database;
  auth: Auth;
  /** A sign-up-enabled instance (only used to create the account). */
  signupAuth: Auth;
  secret: string;
}

/**
 * Makes sure the demo account exists and its password matches the current secret. A stale one
 * (the secret changed: Better Auth answers the check sign-in with 401) is deleted, which cascades
 * its sessions and accounts (it owns no runs), and created again. Any other failure is rethrown.
 * Demo sessions do not survive a restart, like the sandboxes: the check sign-in and sign-up both
 * create a session, so every session row of the demo user is deleted before returning.
 */
export async function ensureDemoUser({
  db,
  auth,
  signupAuth,
  secret,
}: EnsureDemoUserOptions): Promise<{ id: string }> {
  const password = demoPassword(secret);
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEMO_USER_EMAIL));
  if (existing) {
    try {
      await auth.api.signInEmail({ body: { email: DEMO_USER_EMAIL, password } });
      await db.delete(session).where(eq(session.userId, existing.id));
      return { id: existing.id };
    } catch (err) {
      if (!(err instanceof APIError) || err.statusCode !== 401) throw err;
      await db.delete(user).where(eq(user.id, existing.id));
    }
  }
  const created = await createUser(signupAuth, {
    email: DEMO_USER_EMAIL,
    name: DEMO_USER_NAME,
    password,
  });
  await db.delete(session).where(eq(session.userId, created.id));
  return { id: created.id };
}

export interface DemoSignIn {
  headers: Headers;
  user: { id: string; email: string; name: string };
}

/** Signs the guest in as the demo account; `headers` carry the session Set-Cookie. */
export async function demoSignIn(auth: Auth, secret: string): Promise<DemoSignIn> {
  const { headers, response } = await auth.api.signInEmail({
    body: { email: DEMO_USER_EMAIL, password: demoPassword(secret) },
    returnHeaders: true,
  });
  const { id, email, name } = response.user;
  return { headers, user: { id, email, name } };
}
