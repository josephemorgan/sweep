import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorDto, Issue } from '@sweep/core';

export const NETWORK_MESSAGE = "Can't reach Sweep. Check your connection.";

/** Every API failure, normalized. `status` 0 means the request never got an answer. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: readonly Issue[] = [],
  ) {
    super(message);
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

function isApiErrorDto(body: unknown): body is ApiErrorDto {
  const error = (body as Partial<ApiErrorDto> | null)?.error;
  return typeof error === 'object' && error !== null && typeof error.code === 'string';
}

/** Better Auth answers `{code, message}` without our envelope. */
function isAuthErrorBody(body: unknown): body is { code: string; message?: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string'
  );
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return new ApiError(0, 'network', NETWORK_MESSAGE);
    const body: unknown = err.error;
    const fallback = `Request failed (${err.status}).`;
    if (isApiErrorDto(body)) {
      return new ApiError(
        err.status,
        body.error.code,
        body.error.message || fallback,
        body.error.issues ?? [],
      );
    }
    if (isAuthErrorBody(body)) return new ApiError(err.status, body.code, body.message ?? fallback);
    return new ApiError(err.status, 'http', fallback);
  }
  return new ApiError(0, 'network', NETWORK_MESSAGE);
}

/** Spec §5.7: network errors, 5xx, 408 and 429 are retried; any other status is final. */
export function isRetryable(e: ApiError): boolean {
  return e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500;
}
