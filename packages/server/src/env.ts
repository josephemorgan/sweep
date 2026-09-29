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
    throw new Error('BETTER_AUTH_URL must be a valid http or https URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `BETTER_AUTH_URL must use http or https, got scheme "${url.protocol.slice(0, -1)}".`,
    );
  }
  return url.origin;
}

/** Exact WHATWG hostnames (lower-cased, IPv6 bracketed), never a prefix match. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * In production, Better Auth's cookies must be Secure, which follows BETTER_AUTH_URL's scheme.
 * The error names the variable and scheme only: the URL could carry credentials.
 */
function requireHttpsInProduction(origin: string, nodeEnv: string | undefined): void {
  const url = new URL(origin);
  if (nodeEnv !== 'production' || url.protocol === 'https:') return;
  // Spec §6.4: loopback is exempt. The image runs with NODE_ENV=production, and compose and the
  // CI smoke job serve it on http://localhost:3000; a loopback origin can't serve other users,
  // and browsers treat loopback as a secure context.
  if (LOOPBACK_HOSTS.has(url.hostname)) return;
  throw new Error(
    `BETTER_AUTH_URL must be https in production (only loopback origins may use http), got scheme "${url.protocol.slice(0, -1)}".`,
  );
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
  const betterAuthUrl = readOrigin(source['BETTER_AUTH_URL']);
  requireHttpsInProduction(betterAuthUrl, source['NODE_ENV']);
  return {
    databaseUrl,
    port,
    signupEnabled: signup === 'true',
    betterAuthSecret: readSecret(source['BETTER_AUTH_SECRET']),
    betterAuthUrl,
    clientDistDir: source['CLIENT_DIST_DIR'] || undefined,
    trustProxy: readTrustProxy(source['TRUST_PROXY']),
    parseTimeoutMs: readParseTimeout(source['PARSE_TIMEOUT_MS']),
  };
}
