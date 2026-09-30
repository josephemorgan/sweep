import { readClientSource } from '../testing/read-client-source';

const css = readClientSource('styles.css');
const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];

describe('self-hosted fonts', () => {
  it.each(['Bricolage Grotesque', 'Atkinson Hyperlegible'])(
    'declares %s with font-display: swap',
    (family) => {
      const own = faces.filter((f) => f.includes(`font-family: '${family}'`));
      expect(own.length).toBeGreaterThan(0);
      for (const face of own) expect(face).toMatch(/font-display:\s*swap/);
    },
  );

  it('never references Google Fonts', () => {
    expect(css).not.toContain('googleapis');
    expect(readClientSource('index.html')).not.toContain('googleapis');
  });
});
