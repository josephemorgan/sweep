import type { Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import {
  LIMITS,
  parseUpload,
  type ParsedUpload,
  type UploadedFile,
} from '../guides/core-adapter.js';
import { ApiErrorCode, HttpError } from './errors.js';
import { getUser } from './locals.js';

const upload = multer({
  storage: multer.memoryStorage(),
  // Busboy's default is latin1; browsers send UTF-8 file names (Review Focus 1).
  defParamCharset: 'utf8',
  // Text fields are a run name or a baseVersion: short names, small values.
  limits: {
    fileSize: LIMITS.fileBytes,
    files: 1,
    fields: 5,
    parts: 7,
    fieldSize: 1024,
    fieldNameSize: 32,
  },
});

/** One in-memory file in field `file` (spec §6.4). The declared content type is ignored. */
export function singleUpload(): RequestHandler {
  const handler = upload.single('file');
  return (req, res, next) => {
    handler(req, res, (err: unknown) => {
      if (err === undefined || err === null) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new HttpError(413, ApiErrorCode.TooLarge, 'Guide files must be 2 MiB or smaller.'));
        return;
      }
      // Other multer and busboy errors are malformed client input (wrong field, extra parts…).
      next(
        new HttpError(
          400,
          ApiErrorCode.BadRequest,
          'Malformed upload: send one file in the "file" field.',
        ),
      );
    });
  };
}

export function requireFile(req: Request): UploadedFile {
  if (!req.file) {
    throw new HttpError(400, ApiErrorCode.BadRequest, 'Attach the guide file in the "file" field.');
  }
  return { originalname: req.file.originalname, buffer: req.file.buffer };
}

export interface UploadParserOptions {
  /** Time budget per parse (PARSE_TIMEOUT_MS). */
  timeoutMs: number;
  /** Test hook: the worker entry to run instead of parse-worker. */
  workerUrl?: URL | undefined;
}

/** Parses the request's upload (after singleUpload and requireSession). */
export type UploadParser = (req: Request, res: Response) => Promise<ParsedUpload>;

/**
 * Parses uploads in a worker with a time budget, one parse per user at a time (spec §6.4).
 * A second upload while the user's parse runs is refused with 429, never queued. The slot is
 * freed once the parse settles: done, over budget (the result is the single `limit` issue, answered like any invalid guide), failed
 * (500), or stopped because the client went away. On abort the worker is terminated rather than
 * left to finish, so closing requests can't stack up parses past the one-per-user cap.
 */
export function uploadParser(options: UploadParserOptions): UploadParser {
  const parsing = new Set<string>();
  return async (req, res) => {
    const file = requireFile(req);
    const userId = getUser(res).id;
    if (parsing.has(userId)) {
      throw new HttpError(
        429,
        ApiErrorCode.RateLimited,
        'Another guide is still being checked. Only one of your guides can be checked at a time.',
      );
    }
    parsing.add(userId);
    const aborter = new AbortController();
    // Nothing has been written yet, so a close now means the client went away.
    const onClose = (): void => {
      aborter.abort(
        new HttpError(
          400,
          ApiErrorCode.BadRequest,
          'The upload was cancelled before it was checked.',
        ),
      );
    };
    if (res.closed || req.socket.destroyed) onClose();
    else res.once('close', onClose);
    try {
      const upload = await parseUpload(file, { ...options, signal: aborter.signal });
      return upload;
    } finally {
      res.off('close', onClose);
      parsing.delete(userId);
    }
  };
}
