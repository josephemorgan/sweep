/// <reference types="node" />
import { readFileSync } from 'node:fs';

const tokens = readFileSync('src/styles/tokens.css', 'utf8');

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
