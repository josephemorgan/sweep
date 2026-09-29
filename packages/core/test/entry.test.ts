import { describe, expect, it } from 'vitest';
import { FORMAT_VERSION, MODEL_VERSION } from '../src/index.js';

describe('@sweep/core entry', () => {
  it('exposes the guide format version (spec §3.3: sweep: 1)', () => {
    expect(FORMAT_VERSION).toBe(1);
  });

  it('exposes the normalized model version (spec §4.1)', () => {
    expect(MODEL_VERSION).toBe(1);
  });
});
