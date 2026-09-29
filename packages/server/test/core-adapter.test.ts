import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  displayFileName,
  guideSchemaJson,
  parseUpload,
  reparse,
  requireValidGuide,
  validGuide,
} from '../src/guides/core-adapter.js';
import {
  CRASH_EXIT,
  CRASH_OOM,
  CRASH_THROW,
  deeplyNestedMd,
  TINY_GROUPED_YAML,
  TINY_GUIDE,
  TINY_INVALID_YAML,
  TINY_MD,
  TINY_RENAMED_YAML,
  TINY_WARNING_YAML,
  TINY_YAML,
} from './helpers/guides.js';
import { CRASH_WORKER_URL, nextWorker } from './helpers/workers.js';

const upload = (source: string | Buffer, originalname = 'tiny.yaml') =>
  parseUpload({ originalname, buffer: Buffer.isBuffer(source) ? source : Buffer.from(source) });

describe('core adapter', () => {
  it('parses TINY_YAML into exactly the hand-built TINY_GUIDE (fixture drift check)', async () => {
    const parsed = await upload(TINY_YAML);
    expect(parsed.result.issues).toEqual([]);
    expect(parsed.result.guide).toEqual(TINY_GUIDE);
  });

  it('describes the upload', async () => {
    const buffer = Buffer.from(TINY_YAML);
    const parsed = await upload(buffer);
    expect(parsed).toMatchObject({
      fileName: 'guide.yaml',
      displayName: 'tiny.yaml',
      container: 'yaml',
      source: TINY_YAML,
      bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    });
  });

  it('maps extensions case-insensitively: .YML is YAML, .md is Markdown', async () => {
    expect(await upload(TINY_YAML, 'Guide.YML')).toMatchObject({
      fileName: 'guide.yml',
      container: 'yaml',
    });
    const md = await upload(TINY_MD, 'tiny.md');
    expect(md).toMatchObject({ fileName: 'guide.md', container: 'md' });
    expect(md.result.guide?.sections[0]?.children[0]?.walkthrough).toBe('Talk to the elder.');
  });

  it.each(['guide.txt', 'guide', 'guide.yaml.exe', '.yaml.'])(
    'refuses %j with 422 bad-extension',
    async (name) => {
      await expect(upload(TINY_YAML, name)).rejects.toMatchObject({
        status: 422,
        code: 'bad-extension',
      });
    },
  );

  it('parses every valid fixture without errors', async () => {
    for (const source of [TINY_RENAMED_YAML, TINY_GROUPED_YAML, TINY_WARNING_YAML]) {
      const { result } = await upload(source);
      expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(validGuide(result)).not.toBeNull();
    }
    const warnings = (await upload(TINY_WARNING_YAML)).result.issues.map((i) => i.code);
    expect(warnings).toContain('unused-category');
  });

  it('reports invalid guides and refuses them with 422 invalid-guide', async () => {
    const { result } = await upload(TINY_INVALID_YAML);
    expect(validGuide(result)).toBeNull();
    expect(() => requireValidGuide(result)).toThrow(
      expect.objectContaining({ status: 422, code: 'invalid-guide', issues: result.issues }),
    );
  });

  it('reports invalid UTF-8 as an encoding error (core does the check)', async () => {
    const bytes = Buffer.concat([Buffer.from('sweep: 1\n'), Buffer.from([0xc3, 0x28])]);
    const { result } = await upload(bytes);
    expect(result.issues.map((i) => i.code)).toContain('encoding');
  });

  it('refuses a NUL character, which Postgres text and jsonb cannot store', async () => {
    const { result } = await upload(`${TINY_MD}\nNUL here: \u0000\n`, 'tiny.md');
    const nul = result.issues.find((i) => i.code === 'encoding');
    expect(nul).toMatchObject({ severity: 'error', file: 'guide.md' });
    expect(validGuide(result)).toBeNull();
  });

  it('refuses a NUL in a YAML comment (the source is stored even though the model is clean)', async () => {
    const { result } = await upload(`${TINY_YAML}# NUL \u0000\n`);
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'error', code: 'encoding', file: 'guide.yaml' }),
    ]);
    expect(validGuide(result)).toBeNull();
  });

  it.each([
    ['a NUL', '"Start \\0 here."'],
    ['a NUL', '"Start \\u0000 here."'],
    ['an unpaired surrogate', '"Start \\ud800 here."'],
    ['an unpaired surrogate', '"Start \\udc00 here."'],
  ])('refuses %s written as a YAML escape (%s), which jsonb cannot store', async (_, escaped) => {
    const { result } = await upload(TINY_YAML.replace('Start here.', escaped));
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'error', code: 'encoding', file: 'guide.yaml' }),
    ]);
    expect(validGuide(result)).toBeNull();
  });

  it('keeps a well-formed astral escape', async () => {
    const { result } = await upload(TINY_YAML.replace('Start here.', '"Start \\U0001F5FA here."'));
    expect(validGuide(result)?.sections[0]?.children[0]?.overview).toBe('Start 🗺 here.');
  });

  it('reparses a stored source with the same checks', async () => {
    const good = await reparse(TINY_MD, 'guide.md');
    expect(good.timedOut).toBe(false);
    expect(good.result.guide).toEqual((await upload(TINY_MD, 'tiny.md')).result.guide);
    const bad = await reparse(TINY_YAML.replace('Start here.', '"\\0"'), 'guide.yaml');
    expect(bad.timedOut).toBe(false);
    expect(bad.result.issues.map((i) => i.code)).toEqual(['encoding']);
  });

  it.each([
    ['ガイド 🗺.yaml', 'ガイド 🗺.yaml'],
    ['C:\\Users\\me\\guide.yaml', 'guide.yaml'],
    ['dir/sub/guide.md', 'guide.md'],
    ['bell\u0007\u0000name.yaml', 'bellname.yaml'],
    ['c1\u0085\u009fname.md', 'c1name.md'],
    ['   ', 'guide'],
    ['dir/', 'guide'],
    ['x'.repeat(300) + '.yaml', 'x'.repeat(255)],
    ['🗺'.repeat(300) + '.yaml', '🗺'.repeat(255)],
  ])('displayFileName(%j) → %j', (input, expected) => {
    expect(displayFileName(input)).toBe(expected);
  });

  it('decides acceptance by the extension alone, whatever the rest of the name', async () => {
    const parsed = await upload(TINY_YAML, 'C:\\ガイド\\bell\u0007 🗺.YAML');
    expect(parsed).toMatchObject({ fileName: 'guide.yaml', displayName: 'bell 🗺.YAML' });
  });

  describe('in a worker thread with a time budget (spec §6.4)', () => {
    const nested = { originalname: 'slow.md', buffer: Buffer.from(deeplyNestedMd()) };
    const limitIssue = (message: string) => ({
      severity: 'error',
      code: 'limit',
      message,
      file: null,
      line: null,
      column: null,
      path: null,
    });

    it('never parses on the main thread', async () => {
      const next = nextWorker();
      expect((await upload(TINY_YAML)).result.guide).toEqual(TINY_GUIDE);
      expect(await (await next).exited).toBe(0);
    });

    it('stops an upload parse that runs over its budget with exactly one limit issue', async () => {
      const next = nextWorker();
      const started = performance.now();
      const parsed = await parseUpload(nested, { timeoutMs: 200 });
      // The full parse takes well over 10 s: only terminating the worker gets back this fast.
      expect(performance.now() - started).toBeLessThan(3_000);
      expect(parsed.timedOut).toBe(true);
      expect(parsed.result).toEqual({
        issues: [limitIssue('the guide took too long to parse (over 0.2 s)')],
      });
      expect(validGuide(parsed.result)).toBeNull();
      await (
        await next
      ).exited;
    });

    it('stops a reparse that runs over its budget the same way', async () => {
      const outcome = await reparse(deeplyNestedMd(), 'guide.md', { timeoutMs: 1_500 });
      expect(outcome).toEqual({
        result: { issues: [limitIssue('the guide took too long to parse (over 1.5 s)')] },
        timedOut: true,
      });
    });

    it('marks an upload parse that finished as not timed out', async () => {
      expect((await upload(TINY_YAML)).timedOut).toBe(false);
    });

    it('terminates the worker and rejects with the reason when the signal aborts', async () => {
      const controller = new AbortController();
      const next = nextWorker();
      const parsing = parseUpload(nested, { timeoutMs: 60_000, signal: controller.signal });
      const { exited } = await next;
      controller.abort(new Error('client went away'));
      await expect(parsing).rejects.toThrow('client went away');
      await exited;
    });

    it('rejects at once for a signal that has already aborted', async () => {
      const signal = AbortSignal.abort(new Error('already gone'));
      await expect(parseUpload(nested, { signal })).rejects.toThrow('already gone');
    });

    it.each([
      ['throws', CRASH_THROW, /^Error: guide parse worker failed \(Error\)/],
      ['exits without replying', CRASH_EXIT, /^Error: guide parse worker exited with code 3/],
      [
        'runs out of memory',
        CRASH_OOM,
        /^Error: guide parse worker failed \(Error, ERR_WORKER_OUT_OF_MEMORY\)/,
      ],
    ])('rejects without guide content when the worker %s', async (_, marker, logged) => {
      const parsing = parseUpload(
        { originalname: 'tiny.yaml', buffer: Buffer.from(TINY_YAML + marker) },
        { workerUrl: CRASH_WORKER_URL },
      );
      const err = await parsing.then(
        () => new Error('resolved'),
        (e: unknown) => e as Error,
      );
      expect(err.stack).toMatch(logged);
      expect(err.stack).not.toMatch(/crash-worker|Tiny guide/);
    });

    it('rejects when the worker entry cannot be loaded', async () => {
      const workerUrl = new URL('./helpers/no-such-worker.ts', import.meta.url);
      await expect(reparse(TINY_YAML, 'guide.yaml', { workerUrl })).rejects.toThrow(
        /guide parse worker failed/,
      );
    });

    it('runs the real parser through the test worker when there is no marker', async () => {
      const parsed = await parseUpload(
        { originalname: 'tiny.yaml', buffer: Buffer.from(TINY_YAML) },
        { workerUrl: CRASH_WORKER_URL },
      );
      expect(parsed.result.guide).toEqual(TINY_GUIDE);
    });
  });

  it('exposes the JSON Schema', () => {
    const schema = guideSchemaJson();
    expect(schema['$schema']).toMatch(/2020-12/);
    expect(guideSchemaJson()).toBe(schema); // memoized
  });
});
