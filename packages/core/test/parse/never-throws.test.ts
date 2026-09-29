import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGuide, type GuideFiles } from '../../src/parse/index.js';
import { FIXTURES, readFixture } from '../helpers.js';

const HEAD = 'sweep: 1\ngame: G\nsections:\n  - id: a\n    title: A\n    overview: One.\n';
const FRONT = `---\n${HEAD}---\n`;

const ADVERSARIAL: [string, GuideFiles][] = [
  [
    'an alias inside its own anchor',
    {
      'guide.yaml':
        'sweep: 1\ngame: G\nsections: &s [{id: a, title: A, overview: O, sections: *s}]\n',
    },
  ],
  [
    'an alias to an ancestor section',
    {
      'guide.yaml':
        'sweep: 1\ngame: G\nsections:\n  - &g\n    id: g\n    title: G\n    overview: O\n    sections:\n      - *g\n',
    },
  ],
  [
    '5,000 nested quotes in a walkthrough',
    { 'guide.yaml': `${HEAD}    walkthrough: "${'>'.repeat(5000)} x"\n` },
  ],
  [
    '3,000 nested lists in a walkthrough',
    { 'guide.yaml': `${HEAD}    walkthrough: "${'- '.repeat(3000)}x"\n` },
  ],
  ['3,000 nested lists in a .md body', { 'guide.md': `${FRONT}# a\n${'- '.repeat(3000)}x\n` }],
  ['5,000 nested quotes in a .md body', { 'guide.md': `${FRONT}# a\n${'>'.repeat(5000)} x\n` }],
  [
    'a heading under 5,000 quotes in a .md body',
    { 'guide.md': `${FRONT}${'>'.repeat(5000)} # a\n` },
  ],
];

describe('parseGuide never throws', () => {
  // Deeply nested lists take mdast seconds to parse (quadratic). Bounding parse time is the
  // server's job (session C), so these only get a generous timeout.
  it.each(ADVERSARIAL)(
    'on %s',
    (name, files) => {
      const result = parseGuide(files);
      expect(Array.isArray(result.issues)).toBe(true);
      // Deep Markdown is valid prose: it must not turn into an error either.
      if (name.includes('nested')) {
        expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
        expect(result.guide).toBeDefined();
      }
    },
    30_000,
  );

  it('on 200 seeded mutations of the valid fixtures', () => {
    const names = readdirSync(new URL('valid/', FIXTURES)).filter((n) => /\.(ya?ml|md)$/.test(n));
    const sources = names.map((name) => ({ name, text: readFixture(`valid/${name}`) }));
    const random = mulberry32(0x5eed);
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
    for (let i = 0; i < 200; i += 1) {
      const source = pick(sources);
      let text = source.text;
      const edits = 1 + Math.floor(random() * 3);
      for (let e = 0; e < edits; e += 1) text = mutate(text, random, pick);
      const file = source.name.endsWith('.md') ? 'guide.md' : 'guide.yaml';
      let result: ReturnType<typeof parseGuide> | undefined;
      expect(() => {
        result = parseGuide({ [file]: text });
      }, `mutation ${i} of ${source.name}:\n${text}`).not.toThrow();
      expect(Array.isArray(result?.issues)).toBe(true);
    }
  });
});

/** A small seeded PRNG (mulberry32), so every run tries the same mutations. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REPLACEMENTS = ['null', 'true', '[]', '{}', '~', '', '"x"', '-1'];

/** One random edit: delete, duplicate or reindent a line, replace a scalar, or truncate. */
function mutate(text: string, random: () => number, pick: <T>(list: readonly T[]) => T): string {
  const lines = text.split('\n');
  const at = Math.floor(random() * lines.length);
  const line = lines[at]!;
  switch (Math.floor(random() * 5)) {
    case 0:
      lines.splice(at, 1);
      break;
    case 1:
      lines.splice(at, 0, line);
      break;
    case 2: {
      const indent = pick([0, 1, 2, 4, 6, 8]);
      lines[at] = ' '.repeat(indent) + line.trimStart();
      break;
    }
    case 3: {
      const scalar = /^(\s*(?:- )?[\w-]+:)\s.*$/.exec(line);
      lines[at] = scalar === null ? line : `${scalar[1]} ${pick(REPLACEMENTS)}`;
      break;
    }
    default:
      return text.slice(0, Math.floor(random() * text.length));
  }
  return lines.join('\n');
}
