import { once } from 'node:events';
import { request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH_BODY_LIMIT_BYTES } from '../src/limits.js';
import { TEST_PASSWORD, createTestContext, type TestContext } from './helpers/context.js';

interface RawResponse {
  status: number;
  body: unknown;
  /** Body bytes the client had written when the response arrived. */
  sentBytes: number;
}

/**
 * POSTs to the sign-in route and keeps writing 16 KiB chunks up to `bodyBytes`, but never ends
 * the request. Resolves as soon as a response arrives, so a server that waits for the whole
 * body (or buffers it all) never answers and the race times out.
 */
function postWithoutEnding(
  port: number,
  origin: string,
  headers: Record<string, string>,
  bodyBytes: number,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      port,
      method: 'POST',
      path: '/api/auth/sign-in/email',
      headers: { 'content-type': 'application/json', origin, ...headers },
    });
    const chunk = Buffer.alloc(16 * 1024, 0x20);
    let sent = 0;
    let answered = false;
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`no response after sending ${sent} bytes`));
    }, 3_000);
    req.on('error', (err) => {
      // The server closes the connection after answering; later write errors are expected.
      if (!answered) reject(err);
    });
    req.on('response', (res: IncomingMessage) => {
      answered = true;
      const sentBytes = sent;
      const parts: Buffer[] = [];
      res.on('data', (part: Buffer) => parts.push(part));
      res.on('end', () => {
        clearTimeout(timer);
        req.destroy();
        const text = Buffer.concat(parts).toString('utf8');
        resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as unknown, sentBytes });
      });
    });
    function pump(): void {
      while (!answered && sent < bodyBytes) {
        sent += chunk.length;
        if (!req.write(chunk)) {
          req.once('drain', pump);
          return;
        }
      }
    }
    pump();
  });
}

describe('/api/auth request body limit', () => {
  let ctx: TestContext;
  let server: Server;
  let port: number;
  beforeAll(async () => {
    ctx = await createTestContext();
    await ctx.createUser('ann@example.com');
    server = ctx.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    server.closeAllConnections();
    server.close();
    await ctx.close();
  });

  const tooLarge = { error: { code: 'too-large', message: expect.any(String) } };

  it('answers an oversize chunked body with 413 without waiting for the rest of it', async () => {
    const res = await postWithoutEnding(port, ctx.origin, {}, 1024 * 1024);
    expect(res.status).toBe(413);
    expect(res.body).toEqual(tooLarge);
  });

  it('answers an oversize Content-Length with 413 before reading the body', async () => {
    const declared = 200 * 1024 * 1024;
    const res = await postWithoutEnding(
      port,
      ctx.origin,
      { 'content-length': String(declared) },
      AUTH_BODY_LIMIT_BYTES / 2,
    );
    expect(res.status).toBe(413);
    expect(res.body).toEqual(tooLarge);
    expect(res.sentBytes).toBeLessThan(declared);
  });

  it('still signs in with a body under the limit', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/sign-in/email')
      .set('Origin', ctx.origin)
      .send({ email: 'ann@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('still signs in with a form-encoded body', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/sign-in/email')
      .set('Origin', ctx.origin)
      .type('form')
      .send({ email: 'ann@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });
});
