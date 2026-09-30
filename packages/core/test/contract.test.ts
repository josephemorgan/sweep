import { describe, expect, expectTypeOf, it } from 'vitest';
import { loadGuide, progress } from './helpers.js';
import * as core from '../src/index.js';
import * as parse from '../src/parse/index.js';
import type { ClearImpact, Guide, GuideDiff } from '../src/index.js';

describe('public contract', () => {
  it('exports every main-entry value', () => {
    const fns = [
      'deriveRun',
      'deriveCore',
      'clearImpact',
      'deriveMetricTasks',
      'deriveMetrics',
      'diffGuides',
      'migrateProgress',
      'guideSummary',
      'emptyProgress',
      'setCleared',
      'setPin',
      'setTaskState',
      'setTracked',
      'progressFromDto',
      'progressToDto',
    ] as const;
    for (const name of fns) expect(typeof core[name], name).toBe('function');
    for (const name of ['SectionState', 'WindowStatus', 'ProgressKind'] as const) {
      expect(typeof core[name], name).toBe('object');
    }
    expect(core.END).toBe('end');
  });

  it('exports every parse-entry value', () => {
    expect(typeof parse.parseGuide).toBe('function');
    expect(typeof parse.guideFileName).toBe('function');
    expect(typeof parse.guideJsonSchema).toBe('function');
    expect(typeof parse.ErrorCode).toBe('object');
    expect(typeof parse.WarningCode).toBe('object');
    expect(typeof parse.LIMITS).toBe('object');
  });

  it('keeps the main entry free of the parser', () => {
    expect('guideFileName' in core).toBe(false);
    expect('parseGuide' in core).toBe(false);
  });

  it('keeps the 29 spec §3.6 error codes', () => {
    expect(Object.values(parse.ErrorCode)).toHaveLength(29);
    expect(parse.ErrorCode.NoRootFile).toBe('no-root-file');
    expect(parse.ErrorCode.Limit).toBe('limit');
  });

  it('types the signatures', () => {
    expectTypeOf(parse.parseGuide)
      .parameter(0)
      .toEqualTypeOf<Record<string, string | Uint8Array>>();
    expectTypeOf<parse.GuideFiles>().toEqualTypeOf<Record<string, string | Uint8Array>>();
    expectTypeOf(core.diffGuides).returns.toEqualTypeOf<GuideDiff>();
    expectTypeOf(core.clearImpact).returns.toEqualTypeOf<ClearImpact>();
  });

  it('summarises a guide', () => {
    const section = (id: string, children: Guide['sections'] = []): Guide['sections'][number] => ({
      id,
      title: id,
      overview: '',
      walkthrough: null,
      requires: { all: [] },
      spoiler: false,
      renamedFrom: [],
      children,
    });
    const guide: Guide = {
      formatVersion: 1,
      game: 'g',
      title: 't',
      categories: [{ id: 'loot', name: 'Loot', about: '', tracked: true }],
      sections: [section('grp', [section('a'), section('b')])],
      tasks: [
        {
          id: 'x',
          title: 'x',
          category: 'loot',
          how: null,
          windows: [{ from: 'a', until: 'a', home: 'a' }],
          exclusive: null,
          spoiler: false,
          renamedFrom: [],
        },
      ],
    };
    expect(core.guideSummary(guide)).toEqual({
      game: 'g',
      title: 't',
      sections: 3,
      leaves: 2,
      tasks: 1,
      categories: 1,
    });
  });

  it('has no stubs left', () => {
    const guide = loadGuide('tiny-linear');
    const empty = progress();
    const leaf = guide.sections[0]!.id;
    const run = core.deriveRun(guide, empty);
    expect(() => core.clearImpact(guide, empty, leaf)).not.toThrow();
    expect(() => core.deriveMetrics(guide, empty, run)).not.toThrow();
    const diff = core.diffGuides(guide, guide, empty);
    expect(() => core.migrateProgress(empty, diff)).not.toThrow();
  });

  it('names uploads', () => {
    const cases: [string, string | null][] = [
      ['a.yaml', 'guide.yaml'],
      ['A.YML', 'guide.yml'],
      ['x.md', 'guide.md'],
      ['x.txt', null],
      ['yaml', null],
      ['dir/x.Md', 'guide.md'],
    ];
    for (const [input, expected] of cases) expect(parse.guideFileName(input), input).toBe(expected);
  });
});
