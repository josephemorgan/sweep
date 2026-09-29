import { PARSE_TIMEOUT_MS } from './limits.js';

export interface Env {
  databaseUrl: string;
  port: number;
  signupEnabled: boolean;
  betterAuthSecret: string;
  /** The origin users load the app from: BETTER_AUTH_URL reduced to `scheme://host[:port]`. */
  betterAuthUrl: string;
  /** Built client to serve (set in the Docker image only). */
  clientDistDir: string | undefined;
  /** Express `trust proxy` hop count, or false when TRUST_PROXY is unset. */
  trustProxy: number | false;
  /** Time budget per guide parse, in ms (spec §6.4). */
  parseTimeoutMs: number;
}

export const MIN_SECRET_LENGTH = 32;
const MAX_PROXY_HOPS = 10;
/** Spec §6.4 asks for a budget of a few seconds; a minute is already far past useful. */
const MAX_PARSE_TIMEOUT_MS = 60_000;

function readOrigin(raw: string | undefined): string {
  if (!raw) {
    throw new Error(
      'BETTER_AUTH_URL is required: the origin users load the app from, e.g. http://localhost:4200.',
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`BETTER_AUTH_URL must be a valid URL, got "${raw}".`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`BETTER_AUTH_URL must use http or https, got "${raw}".`);
  }
  return url.origin;
}

function readSecret(raw: string | undefined): string {
  if (!raw || raw.length < MIN_SECRET_LENGTH) {
    // Never echo the value: it is a secret even when it's too short.
    throw new Error(
      `BETTER_AUTH_SECRET is required and must be at least ${MIN_SECRET_LENGTH} characters (generate one with: openssl rand -base64 32).`,
    );
  }
  return raw;
}

function readTrustProxy(raw: string | undefined): number | false {
  if (raw === undefined || raw.trim() === '') return false;
  const hops = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || !Number.isInteger(hops) || hops > MAX_PROXY_HOPS) {
    throw new Error(
      `TRUST_PROXY must be a whole number of proxy hops (0-${MAX_PROXY_HOPS}), got "${raw}".`,
    );
  }
  return hops;
}

function readParseTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return PARSE_TIMEOUT_MS;
  const ms = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || ms < 1 || ms > MAX_PARSE_TIMEOUT_MS) {
    throw new Error(
      `PARSE_TIMEOUT_MS must be a whole number of milliseconds (1-${MAX_PARSE_TIMEOUT_MS}), got "${raw}".`,
    );
  }
  return ms;
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
    betterAuthSecret: readSecret(source['BETTER_AUTH_SECRET']),
    betterAuthUrl: readOrigin(source['BETTER_AUTH_URL']),
    clientDistDir: source['CLIENT_DIST_DIR'] || undefined,
    trustProxy: readTrustProxy(source['TRUST_PROXY']),
    parseTimeoutMs: readParseTimeout(source['PARSE_TIMEOUT_MS']),
  };
}
