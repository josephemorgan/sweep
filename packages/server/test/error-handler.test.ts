import { DrizzleQueryError } from 'drizzle-orm';
import express, { type Express, type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@sweep/core';
import { errorHandler } from '../src/http/error-handler.js';
import { HttpError } from '../src/http/errors.js';

function appThrowing(err: unknown): Express {
  const app = express();
  app.get('/boom', () => {
    throw err;
  });
  app.use(errorHandler());
  return app;
}

const issue: Issue = {
  severity: 'error',
  code: 'unknown-category',
  message: 'Category "nope" is not defined.',
  file: 'guide.yaml',
  line: 3,
  column: 5,
  path: 'tasks[0].category',
};

describe('errorHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps an HttpError to its status and body without logging', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(
      appThrowing(new HttpError(409, 'stale-version', 'A newer guide version exists.')),
    ).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'stale-version', message: 'A newer guide version exists.' },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('includes issues when the HttpError has them', async () => {
    const res = await request(
      appThrowing(new HttpError(422, 'invalid-guide', 'The guide has errors.', [issue])),
    ).get('/boom');
    expect(res.status).toBe(422);
    expect(res.body.error.issues).toEqual([issue]);
  });

  it('answers unknown errors with 500 internal and logs the stack', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(appThrowing(new Error('kaboom'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'internal', message: 'Internal server error.' } });
    const logged = spy.mock.calls.flat().join('\n');
    expect(logged).toContain('Error: kaboom');
    expect(logged).toContain('    at ');
  });

  it('logs a failed query without its SQL or params', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = new DrizzleQueryError(
      'update "runs" set "name" = $1',
      ['SECRET-RUN-NAME'],
      new Error('boom from postgres'),
    );
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(500);
    const logged = spy.mock.calls.flat().join('\n');
    expect(logged).toContain('boom from postgres');
    expect(logged).not.toContain('SECRET-RUN-NAME');
    expect(logged).not.toContain('update "runs"');
  });

  it('logs 5xx HttpErrors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(
      appThrowing(new HttpError(500, 'internal', 'Internal server error.')),
    ).get('/boom');
    expect(res.status).toBe(500);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('hands the error on once headers are sent', () => {
    const next = vi.fn();
    const err = new Error('late');
    errorHandler()(err, {} as Request, { headersSent: true } as Response, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});
