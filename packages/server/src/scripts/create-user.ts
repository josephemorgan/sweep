import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH, createAuth, type Auth } from '../auth.js';
import { createDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { readEnv } from '../env.js';
import { loadRootEnvFile } from '../load-env.js';

export interface NewUser {
  email: string;
  name: string;
  password: string;
}

export interface CreatedUser {
  id: string;
  email: string;
}

/** A failure with a message that is safe to print (it never contains the password). */
export class CreateUserError extends Error {
  override readonly name = 'CreateUserError';
}

function isDuplicate(err: unknown): boolean {
  if (!(err instanceof APIError)) return false;
  const code = (err.body as { code?: unknown } | undefined)?.code;
  return (
    (typeof code === 'string' && code.startsWith('USER_ALREADY_EXISTS')) ||
    /already exists/i.test(err.message)
  );
}

/** Creates an account. `auth` must be built with signupEnabled: true (only this script does). */
export async function createUser(auth: Auth, input: NewUser): Promise<CreatedUser> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new CreateUserError(`Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  try {
    const { user } = await auth.api.signUpEmail({
      body: { email: input.email, name: input.name, password: input.password },
    });
    return { id: user.id, email: user.email };
  } catch (err) {
    if (isDuplicate(err)) {
      throw new CreateUserError(`A user with the email ${input.email} already exists.`);
    }
    throw err;
  }
}

const USAGE =
  'Usage: create-user --email <email> [--name <name>]\n' +
  'The password is prompted for (hidden), or read from the first line of stdin when piped.';

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let value = '';
    const cleanup = (): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          cleanup();
          reject(new CreateUserError('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    process.stdout.write(prompt);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function readFirstLine(): Promise<string> {
  const lines = createInterface({ input: process.stdin, terminal: false });
  for await (const line of lines) {
    lines.close();
    return line;
  }
  return '';
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) return readFirstLine();
  const first = await readHidden('Password: ');
  const again = await readHidden('Repeat password: ');
  if (first !== again) throw new CreateUserError('Passwords do not match.');
  return first;
}

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { email: { type: 'string' }, name: { type: 'string' } },
    strict: true,
  });
  const email = z.email().safeParse(values.email?.trim());
  if (!email.success) {
    console.error(USAGE);
    return 1;
  }
  const name = values.name?.trim() || email.data.split('@')[0] || email.data;
  const password = await readPassword();

  loadRootEnvFile();
  const env = readEnv();
  const { db, pool } = createDb(env.databaseUrl);
  try {
    await runMigrations(db);
    const auth = createAuth({
      db,
      secret: env.betterAuthSecret,
      baseURL: env.betterAuthUrl,
      signupEnabled: true,
    });
    const user = await createUser(auth, { email: email.data, name, password });
    console.log(`Created user ${user.email} (${user.id}).`);
    return 0;
  } finally {
    await pool.end();
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(realpathSync(entry)).href;
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      // CreateUserError, parseArgs and readEnv messages never contain the password.
      console.error(err instanceof Error ? err.message : 'create-user failed.');
      process.exitCode = 1;
    },
  );
}
