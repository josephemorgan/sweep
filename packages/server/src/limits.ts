/**
 * express.json() body limit. Uploads are multipart (multer), so JSON bodies stay small.
 * The 413 test derives its oversize body from this constant.
 */
export const JSON_BODY_LIMIT_BYTES = 100 * 1024;
