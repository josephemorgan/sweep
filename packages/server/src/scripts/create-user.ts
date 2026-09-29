import { APIError } from 'better-auth/api';
import { MIN_PASSWORD_LENGTH, type Auth } from '../auth.js';

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
