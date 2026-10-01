import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const client = fileURLToPath(new URL('../packages/client/', import.meta.url));
const fonts = join(client, 'public/fonts');

const woff2 = [
  'BricolageGrotesque[opsz,wght].woff2',
  'AtkinsonHyperlegible-Regular.woff2',
  'AtkinsonHyperlegible-Bold.woff2',
];

describe('self-hosted fonts', () => {
  it.each(woff2)('ships %s under 200 kB', (name) => {
    const path = join(fonts, name);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeLessThan(200 * 1024);
  });

  it.each(['LICENSE-BricolageGrotesque.txt', 'LICENSE-AtkinsonHyperlegible.txt', 'README.md'])(
    'ships %s',
    (name) => {
      expect(existsSync(join(fonts, name))).toBe(true);
    },
  );

  it('precaches the fonts in the app asset group', () => {
    const config = JSON.parse(readFileSync(join(client, 'ngsw-config.json'), 'utf8')) as {
      assetGroups: { name: string; resources: { files: string[] } }[];
    };
    const app = config.assetGroups.find((g) => g.name === 'app');
    expect(app?.resources.files).toContain('/fonts/*.woff2');
  });
});
