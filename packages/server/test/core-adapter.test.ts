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
  TINY_GROUPED_YAML,
  TINY_GUIDE,
  TINY_INVALID_YAML,
  TINY_MD,
  TINY_RENAMED_YAML,
  TINY_WARNING_YAML,
  TINY_YAML,
} from './helpers/guides.js';

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
    expect(nul).toMatchObject({ severity: 'error', file: 'guide.md', line: 51, column: 11 });
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
    expect(result.issues[0]?.message).toContain('"village"');
    expect(validGuide(result)).toBeNull();
  });

  it('keeps a well-formed astral escape', async () => {
    const { result } = await upload(TINY_YAML.replace('Start here.', '"Start \\U0001F5FA here."'));
    expect(validGuide(result)?.sections[0]?.children[0]?.overview).toBe('Start 🗺 here.');
  });

  it('reparses a stored source with the same checks', async () => {
    expect((await reparse(TINY_MD, 'guide.md')).guide).toEqual(
      (await upload(TINY_MD, 'tiny.md')).result.guide,
    );
    const bad = await reparse(TINY_YAML.replace('Start here.', '"\\0"'), 'guide.yaml');
    expect(bad.issues.map((i) => i.code)).toEqual(['encoding']);
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

  it('exposes the JSON Schema', () => {
    const schema = guideSchemaJson();
    expect(schema['$schema']).toMatch(/2020-12/);
    expect(guideSchemaJson()).toBe(schema); // memoized
  });
});
