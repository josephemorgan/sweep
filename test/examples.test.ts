import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { guideFileName, parseGuide } from '@sweep/core/parse';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('../guides/examples/', import.meta.url));
const guides = readdirSync(dir).filter((f) => f !== 'README.md' && guideFileName(f) !== null);

function parse(name: string): ReturnType<typeof parseGuide> {
  return parseGuide({ [guideFileName(name)!]: readFileSync(dir + name, 'utf8') });
}

describe('guides/examples (spec §8)', () => {
  it('has examples', () => expect(guides.length).toBeGreaterThanOrEqual(5));

  it.each(guides)('%s has no issues', (name) => {
    expect(parse(name).issues).toEqual([]);
  });

  const stems = [...new Set(guides.map((f) => f.replace(/\.[^.]+$/, '')))];
  const pairs = stems.filter(
    (s) =>
      guides.includes(`${s}.md`) && guides.some((f) => /\.ya?ml$/.test(f) && f.startsWith(`${s}.`)),
  );
  it('has a .yaml/.md pair', () => expect(pairs).toContain('lantern-keep'));

  it.each(pairs)('%s: .yaml and .md produce the same model', (stem) => {
    const yamlName = guides.find((f) => f === `${stem}.yaml` || f === `${stem}.yml`)!;
    const md = parse(`${stem}.md`).guide;
    expect(md).toBeDefined();
    expect(md).toEqual(parse(yamlName).guide);
  });
});
