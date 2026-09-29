import { FORMAT_VERSION } from '@sweep/core';
import { parseGuide } from '@sweep/core/parse';
import { describe, expect, it } from 'vitest';

describe('@sweep/core workspace link', () => {
  it('resolves both core entry points from the server', () => {
    expect(FORMAT_VERSION).toBe(1);
    expect(parseGuide({}).issues[0]?.severity).toBe('error');
  });
});
