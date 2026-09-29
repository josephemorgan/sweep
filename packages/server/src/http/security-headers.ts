import type { RequestHandler } from 'express';
import helmet from 'helmet';

/**
 * Spec §6.4 CSP. 'unsafe-inline' for styles is the spec's accepted fallback: a nonce needs
 * index.html templating (ngCspNonce), owned by session D. No upgrade-insecure-requests: it
 * breaks http://localhost.
 */
const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'"],
  'object-src': ["'none'"],
  // 'self' keeps Angular's <base href="/"> working on deep links (spec §6.4).
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

export function securityHeaders(): RequestHandler {
  return helmet({ contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES } });
}
