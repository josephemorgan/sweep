import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { LIMITS, type UploadedFile } from '../guides/core-adapter.js';
import { ApiErrorCode, HttpError } from './errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  // Busboy's default is latin1; browsers send UTF-8 file names (Review Focus 1).
  defParamCharset: 'utf8',
  limits: { fileSize: LIMITS.fileBytes, files: 1, fields: 5, parts: 7 },
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
