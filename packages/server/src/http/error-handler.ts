import { DrizzleQueryError } from 'drizzle-orm';
import type { ErrorRequestHandler } from 'express';
import { ApiErrorCode, HttpError } from './errors.js';

function clientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const value = typeof status === 'number' ? status : statusCode;
  return typeof value === 'number' && value >= 400 && value <= 499 ? value : undefined;
}

/**
 * A loggable description of an error. Never includes request bodies, SQL or params:
 * DrizzleQueryError's own message and stack embed the query params (which can be a whole
 * guide source), and body-parser errors carry the raw body in `err.body`.
 */
export function describeError(err: unknown): string {
  if (err instanceof DrizzleQueryError) {
    const cause = err.cause ? (err.cause.stack ?? err.cause.message) : 'no cause recorded';
    return `Database query failed (SQL and params omitted): ${cause}`;
  }
  return err instanceof Error ? (err.stack ?? err.message) : 'Unknown error';
}

interface ErrorBody {
  code: ApiErrorCode;
  message: string;
}

/** Bodies for 4xx errors that aren't HttpErrors (body-parser, multer, http-errors). */
const BAD_REQUEST: ErrorBody = { code: ApiErrorCode.BadRequest, message: 'Malformed request.' };
const CLIENT_ERRORS: Partial<Record<number, ErrorBody>> = {
  401: { code: ApiErrorCode.Unauthorized, message: 'Sign in to continue.' },
  404: { code: ApiErrorCode.NotFound, message: 'Not found.' },
  413: { code: ApiErrorCode.TooLarge, message: 'Request body too large.' },
};

export function errorHandler(): ErrorRequestHandler {
  return (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof HttpError) {
      if (err.status >= 500) console.error(describeError(err));
      res.status(err.status).json(err.toDto());
      return;
    }
    const status = clientErrorStatus(err);
    if (status !== undefined) {
      // Fixed messages: a JSON.parse error message can quote part of the request body.
      res.status(status).json({ error: CLIENT_ERRORS[status] ?? BAD_REQUEST });
      return;
    }
    console.error(describeError(err));
    res
      .status(500)
      .json({ error: { code: ApiErrorCode.Internal, message: 'Internal server error.' } });
  };
}
