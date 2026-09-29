import type { RequestHandler } from 'express';
import { ApiErrorCode, HttpError } from './errors.js';

/**
 * Reads a /api/auth request body into `req.body` as a string of at most `limitBytes`.
 *
 * better-call's node adapter streams raw bodies into Better Auth with no size limit (a chunked
 * body is never capped, a large Content-Length is trusted). Given a request that has already
 * been read, it forwards a string `req.body` verbatim instead, so Better Auth still parses JSON
 * and form bodies itself. An oversize body is answered 413 as soon as it passes the limit (or
 * up front, from Content-Length), and the connection is closed rather than drained.
 */
export function authBodyLimit(limitBytes: number): RequestHandler {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      next();
      return;
    }
    const tooLarge = (): void => {
      req.pause();
      res.setHeader('Connection', 'close');
      next(new HttpError(413, ApiErrorCode.TooLarge, 'Request body too large.'));
    };
    if (Number(req.headers['content-length']) > limitBytes) {
      tooLarge();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = (): void => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };
    function onData(chunk: Buffer): void {
      size += chunk.length;
      if (size > limitBytes) {
        cleanup();
        tooLarge();
        return;
      }
      chunks.push(chunk);
    }
    function onEnd(): void {
      cleanup();
      if (size > 0) req.body = Buffer.concat(chunks, size).toString('utf8');
      next();
    }
    function onError(): void {
      cleanup();
      next(new HttpError(400, ApiErrorCode.BadRequest, 'Request body could not be read.'));
    }
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  };
}
