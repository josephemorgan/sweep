export interface Env {
  databaseUrl: string;
  port: number;
  signupEnabled: boolean;
  /** Required once Better Auth lands (session C). */
  betterAuthSecret: string | undefined;
  betterAuthUrl: string | undefined;
  /** Built client to serve (set in the Docker image only). */
  clientDistDir: string | undefined;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const databaseUrl = source['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required (copy .env.example to .env at the repo root).');
  }
  const rawPort = source['PORT'] ?? '3000';
  const port = Number(rawPort);
  if (rawPort.trim() === '' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${rawPort}".`);
  }
  const signup = source['SIGNUP_ENABLED'] ?? 'false';
  if (signup !== 'true' && signup !== 'false') {
    throw new Error(`SIGNUP_ENABLED must be "true" or "false", got "${signup}".`);
  }
  return {
    databaseUrl,
    port,
    signupEnabled: signup === 'true',
    betterAuthSecret: source['BETTER_AUTH_SECRET'] || undefined,
    betterAuthUrl: source['BETTER_AUTH_URL'] || undefined,
    clientDistDir: source['CLIENT_DIST_DIR'] || undefined,
  };
}
