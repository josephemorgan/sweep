import { readClientSource } from '../testing/read-client-source';

const css = readClientSource('styles.css');

/** Returns the body of `@utility <name> { ... }` (brace-balanced). */
function utilityBody(name: string): string | null {
  const start = css.search(new RegExp(`@utility ${name}\\s*\\{`));
  if (start < 0) return null;
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  return null;
}

describe('styles.css', () => {
  const names = [
    'btn',
    'btn-primary',
    'btn-danger',
    'btn-quiet',
    'field',
    'menu-item',
    'ck',
    'redaction',
  ];

  it.each(names)('defines @utility %s', (name) => {
    expect(utilityBody(name)).not.toBeNull();
  });

  it('btn-primary is a lamp button in the display font', () => {
    const body = utilityBody('btn-primary') ?? '';
    for (const c of ['bg-lamp', 'text-on-lamp', 'font-display']) expect(body).toContain(c);
  });

  it('focus ring uses the lamp token', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*var\(--color-lamp\)/);
  });

  it('phone sheet is flat with a top rule', () => {
    const rule = /(^|\n)\s*\.sheet\s*\{([^}]*)\}/.exec(css)?.[2] ?? '';
    expect(rule).toContain('border-top: 1px solid var(--color-border)');
    expect(rule).toMatch(/border-radius:\s*0\s*;/);
  });

  it('no utility except ck has shadows or pills', () => {
    for (const name of names.filter((n) => n !== 'ck')) {
      const body = utilityBody(name) ?? '';
      expect(body, name).not.toMatch(/shadow-|rounded-full/);
    }
  });

  it('checked ck is accent-filled', () => {
    expect(utilityBody('ck')).toContain('&:checked');
    expect(utilityBody('ck')).toContain('var(--color-accent)');
  });

  it('@utility ck supports forced-colors mode', () => {
    expect(utilityBody('ck')).toContain('forced-colors');
  });
});
