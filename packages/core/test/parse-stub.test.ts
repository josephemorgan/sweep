import { describe, expect, it } from 'vitest';
import { ErrorCode, LIMITS, NOT_IMPLEMENTED, WarningCode, parseGuide } from '../src/parse/index.js';

const SLUG = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

describe('@sweep/core/parse (scaffold stub)', () => {
  it('returns no guide and a single not-implemented error', () => {
    const result = parseGuide({ 'guide.yaml': 'sweep: 1\n' });
    expect(result.guide).toBeUndefined();
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: NOT_IMPLEMENTED,
        message: 'parseGuide is not implemented yet (arrives in session A).',
        file: null,
        line: null,
        column: null,
        path: null,
      },
    ]);
  });

  it('lists every spec §3.6 issue code as a slug, errors and warnings disjoint', () => {
    const errors = Object.values(ErrorCode);
    const warnings = Object.values(WarningCode);
    expect(errors).toHaveLength(29);
    expect(warnings).toHaveLength(6);
    for (const code of [...errors, ...warnings]) expect(code).toMatch(SLUG);
    expect(errors.filter((c) => (warnings as string[]).includes(c))).toEqual([]);
  });

  it('carries the spec §3.7 limits', () => {
    expect(LIMITS.fileBytes).toBe(2 * 1024 * 1024);
    expect(LIMITS.tasks).toBe(10_000);
    expect(LIMITS.yamlAliasExpansions).toBe(100);
  });
});
