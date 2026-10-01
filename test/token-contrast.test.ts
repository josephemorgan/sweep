import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('../packages/client/src/styles/tokens.css', import.meta.url)),
  'utf8',
);

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match) throw new Error(`token ${name} not found`);
  return match[1]!;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('text tokens meet WCAG AA (4.5:1) on both surfaces', () => {
  for (const name of ['fg-muted', 'not-chosen', 'missed', 'last-chance', 'open']) {
    for (const surface of ['surface', 'surface-raised']) {
      it(`${name} on ${surface}`, () => {
        expect(contrast(token(name), token(surface))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
