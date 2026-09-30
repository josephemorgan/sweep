import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const client = fileURLToPath(new URL('../packages/client/', import.meta.url));
const read = (rel: string): string => readFileSync(join(client, rel), 'utf8');
const json = (rel: string): unknown => JSON.parse(read(rel));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('client shell (spec §6.4, §5.7, §5.9)', () => {
  it('index.html has no inline scripts or event-handler attributes (CSP script-src self)', () => {
    const html = read('src/index.html');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it('keeps critical-CSS inlining off in the production build', () => {
    const angular = json('angular.json') as {
      projects: {
        client: {
          architect: {
            build: {
              configurations: {
                production: { optimization: { styles: { inlineCritical: boolean } } };
              };
            };
          };
        };
      };
    };
    expect(
      angular.projects.client.architect.build.configurations.production.optimization.styles
        .inlineCritical,
    ).toBe(false);
  });

  it('declares separate "any" and "maskable" manifest icons', () => {
    const manifest = json('public/manifest.webmanifest') as {
      icons: { src: string; purpose: string }[];
    };
    const purposes = new Set(manifest.icons.map((i) => i.purpose));
    expect(purposes).toEqual(new Set(['any', 'maskable']));
    const maskable = manifest.icons.filter((i) => i.purpose === 'maskable').map((i) => i.src);
    expect(maskable).toEqual(['icons/icon-192x192.png', 'icons/icon-512x512.png']);
  });

  it('the service worker caches the shell only and never serves /api navigations', () => {
    const ngsw = json('ngsw-config.json') as { dataGroups?: unknown; navigationUrls?: string[] };
    expect(ngsw.dataGroups).toBeUndefined();
    expect(ngsw.navigationUrls).toContain('!/api/**');
    expect(read('ngsw-config.json')).not.toContain('index.csr.html');
  });

  it('uses no raw colors outside the tokens file', () => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(client, 'src'))) {
      if (file.endsWith('tokens.css') || file.endsWith('index.html')) continue;
      const text = readFileSync(file, 'utf8');
      const hex = file.endsWith('.css') && /#[0-9a-f]{3,8}\b/i.test(text);
      const fn = /\b(?:rgba?|hsla?|oklch|oklab)\(/i.test(text);
      const arbitrary = /-\[#[0-9a-f]{3,8}\]/i.test(text);
      if (hex || fn || arbitrary) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
