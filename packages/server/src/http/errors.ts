import type { ApiErrorDto, Issue } from '@sweep/core';

export const ApiErrorCode = {
  BadRequest: 'bad-request',
  Unauthorized: 'unauthorized',
  NotFound: 'not-found',
  BadOrigin: 'bad-origin',
  RateLimited: 'rate-limited',
  TooLarge: 'too-large',
  UnknownId: 'unknown-id',
  InvalidGuide: 'invalid-guide',
  BadExtension: 'bad-extension',
  StaleVersion: 'stale-version',
  QuotaRuns: 'quota-runs',
  QuotaVersions: 'quota-versions',
  QuotaStorage: 'quota-storage',
  Internal: 'internal',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** Thrown by routes and helpers; errorHandler() maps it to `{error: {code, message, issues?}}`. */
export class HttpError extends Error {
  override readonly name = 'HttpError';

  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: Issue[],
  ) {
    super(message);
  }

  toDto(): ApiErrorDto {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.issues ? { issues: this.issues } : {}),
      },
    };
  }
}
