import { readClientSource } from '../testing/read-client-source';

const tokens = readClientSource('styles/tokens.css');

const required = [
  '--color-surface',
  '--color-surface-raised',
  '--color-rule',
  '--color-border',
  '--color-scrim',
  '--color-fg',
  '--color-fg-soft',
  '--color-fg-muted',
  '--color-fg-cleared',
  '--color-lamp',
  '--color-on-lamp',
  '--color-accent',
  '--color-on-accent',
  '--color-open',
  '--color-last-chance',
  '--color-missed',
  '--color-not-chosen',
  '--color-rail',
  '--color-rail-dot',
  '--color-rail-ring',
  '--color-redaction',
  '--font-display',
  '--font-body',
  '--radius-control',
  '--radius-panel',
  '--spacing',
];

describe('design tokens', () => {
  it.each(required)('defines %s', (name) => {
    expect(tokens).toMatch(new RegExp(`^\\s*${name}:`, 'm'));
  });

  it('drops the old tokens', () => {
    expect(tokens).not.toContain('--radius-card:');
    expect(tokens).not.toContain('#14151b');
  });
});
