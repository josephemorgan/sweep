import { randomUUID } from 'node:crypto';
import { setPin, type Guide, type RunProgress } from '@sweep/core';
import { describe, expect, it } from 'vitest';
import { GuideContainer } from '../src/db/schema.js';
import { DemoSandboxes } from '../src/demo/sandbox.js';
import type { DemoTemplate } from '../src/demo/types.js';
import type { ParsedUpload } from '../src/guides/core-adapter.js';
import { HttpError } from '../src/http/errors.js';
import { TINY_GUIDE, TINY_YAML } from './helpers/guides.js';

const HOUR = 3_600_000;

function progress(): RunProgress {
  return {
    cleared: new Set(['village', 'keep']),
    pin: 'marsh',
    tasks: new Map([['chest', 'done']]),
    tracked: new Map([['lore', true]]),
  };
}

function template(name: string, playedAgoMs: number): DemoTemplate {
  return {
    name,
    version: {
      version: 1,
      filename: 'tiny.yaml',
      container: GuideContainer.Yaml,
      source: TINY_YAML,
      bytes: Buffer.byteLength(TINY_YAML),
      sha256: 'x',
      guide: TINY_GUIDE,
    },
    progress: progress(),
    createdAgoMs: 10 * 24 * HOUR,
    playedAgoMs,
  };
}

function upload(bytes = 100): ParsedUpload {
  return {
    fileName: 'guide.yaml',
    displayName: 'up.yaml',
    container: GuideContainer.Yaml,
    source: 'x',
    bytes,
    sha256: randomUUID(),
    result: { issues: [] },
    timedOut: false,
  };
}

/** keep becomes castle (renamed_from keep). */
function renamedGuide(): Guide {
  const next = structuredClone(TINY_GUIDE);
  const keep = next.sections.find((s) => s.id === 'keep');
  if (!keep) throw new Error('fixture');
  keep.id = 'castle';
  keep.renamedFrom = ['keep'];
  return next;
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) return `${err.status} ${err.code}`;
    throw err;
  }
  return 'no error';
}

function make(options: ConstructorParameters<typeof DemoSandboxes>[1] = {}) {
  let t = 1_000_000_000_000;
  const clock = {
    now: (): number => t,
    advance: (ms: number): void => {
      t += ms;
    },
  };
  const sandboxes = new DemoSandboxes([template('Old', 5 * HOUR), template('Recent', 1 * HOUR)], {
    now: clock.now,
    ...options,
  });
  return { sandboxes, clock };
}

describe('DemoSandboxes seeding', () => {
  it('seeds every template with fresh ids, copied progress and timestamps relative to now', () => {
    const { sandboxes, clock } = make();
    const a = sandboxes.get('s1', 'u');
    const b = sandboxes.get('s2', 'u');
    expect(a.runs.size).toBe(2);
    const ids = [...a.runs.keys(), ...b.runs.keys()];
    expect(new Set(ids).size).toBe(4);
    const recent = a.list()[0]!;
    expect(recent.row.name).toBe('Recent');
    expect(recent.row.userId).toBe('u');
    expect(recent.row.currentVersion).toBe(1);
    expect(recent.row.pinnedSectionId).toBe('marsh');
    expect(recent.row.updatedAt.getTime()).toBe(clock.now() - HOUR);
    expect(recent.row.createdAt.getTime()).toBe(clock.now() - 10 * 24 * HOUR);
    const other = b.list()[0]!;
    expect(other.versions[0]!.guide).toBe(recent.versions[0]!.guide);
    expect(other.progress).not.toBe(recent.progress);
    expect(other.progress.cleared).not.toBe(recent.progress.cleared);
  });

  it('lists by updatedAt desc, then id desc', () => {
    const { sandboxes } = make();
    const sb = sandboxes.get('s');
    const [first, second] = sb.list();
    expect(first!.row.name).toBe('Recent');
    expect(second!.row.name).toBe('Old');
    second!.row.updatedAt = first!.row.updatedAt;
    const tied = sb.list().map((r) => r.row.id);
    expect(tied).toEqual([...tied].sort().reverse());
  });
});

describe('DemoSandbox writes', () => {
  it('mutateProgress bumps updatedAt and keeps the pin on the row, leaving other sandboxes alone', () => {
    const { sandboxes, clock } = make();
    const sb = sandboxes.get('s');
    const other = sandboxes.get('t');
    const run = sb.list()[1]!;
    clock.advance(1000);
    sb.mutateProgress(run.row.id, (p) => setPin(p, 'keep'));
    expect(run.row.pinnedSectionId).toBe('keep');
    expect(run.progress.pin).toBe('keep');
    expect(run.row.updatedAt.getTime()).toBe(clock.now());
    expect(sb.list()[0]).toBe(run);
    expect(other.list().every((r) => r.progress.pin === 'marsh')).toBe(true);
  });

  it('rename leaves updatedAt alone', () => {
    const { sandboxes } = make();
    const sb = sandboxes.get('s');
    const run = sb.list()[0]!;
    const before = run.row.updatedAt;
    sb.rename(run.row.id, 'New name');
    expect(run.row.name).toBe('New name');
    expect(run.row.updatedAt).toBe(before);
  });

  it('createRun names from the guide and enforces the run quota', () => {
    const { sandboxes } = make({ limits: { runsPerSandbox: 3 } });
    const sb = sandboxes.get('s');
    const run = sb.createRun({ name: undefined, upload: upload(), guide: TINY_GUIDE });
    expect(run.row.name).toBe('Tiny guide');
    expect(run.progress.cleared.size).toBe(0);
    expect(code(() => sb.createRun({ name: 'x', upload: upload(), guide: TINY_GUIDE }))).toBe(
      '409 quota-runs',
    );
  });

  it('enforces the per-sandbox and total storage quotas, and delete frees the bytes', () => {
    const { sandboxes } = make({
      limits: { sourceBytesPerSandbox: 250, sourceBytesTotal: 300 },
    });
    const a = sandboxes.get('a');
    const b = sandboxes.get('b');
    const r1 = a.createRun({ name: 'one', upload: upload(200), guide: TINY_GUIDE });
    const add = (sb: typeof a, bytes: number) => () =>
      sb.createRun({ name: 'two', upload: upload(bytes), guide: TINY_GUIDE });
    expect(code(add(a, 100))).toBe('409 quota-storage');
    // 200 used in total: 150 more fits the sandbox cap but not the total of 300.
    expect(code(add(b, 150))).toBe('409 quota-storage');
    a.delete(r1.row.id);
    expect(a.runs.has(r1.row.id)).toBe(false);
    expect(a.bytes).toBe(0);
    expect(code(add(b, 150))).toBe('no error');
  });
});

describe('DemoSandbox.addVersion', () => {
  it('migrates progress through renames, bumps updatedAt and advances the version', () => {
    const { sandboxes, clock } = make();
    const sb = sandboxes.get('s');
    const run = sb.list()[0]!;
    clock.advance(500);
    sb.addVersion(run.row.id, { upload: upload(), guide: renamedGuide(), baseVersion: 1 });
    expect(run.row.currentVersion).toBe(2);
    expect(run.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(run.progress.cleared.has('castle')).toBe(true);
    expect(run.progress.cleared.has('keep')).toBe(false);
    expect(run.row.updatedAt.getTime()).toBe(clock.now());
    // Another sandbox's progress is untouched.
    expect(sandboxes.get('t').list()[0]!.progress.cleared.has('keep')).toBe(true);
  });

  it('409s a stale baseVersion and the version quota', () => {
    const { sandboxes } = make({ limits: { versionsPerRun: 2 } });
    const sb = sandboxes.get('s');
    const run = sb.list()[0]!;
    const add = (baseVersion: number) => () =>
      sb.addVersion(run.row.id, { upload: upload(), guide: renamedGuide(), baseVersion });
    expect(code(add(7))).toBe('409 stale-version');
    sb.addVersion(run.row.id, { upload: upload(), guide: renamedGuide(), baseVersion: 1 });
    expect(code(add(2))).toBe('409 quota-versions');
  });

  it('counts version uploads against the storage quota', () => {
    const { sandboxes } = make({ limits: { sourceBytesPerSandbox: 50 } });
    const sb = sandboxes.get('s');
    const run = sb.list()[0]!;
    expect(
      code(() =>
        sb.addVersion(run.row.id, { upload: upload(100), guide: renamedGuide(), baseVersion: 1 }),
      ),
    ).toBe('409 quota-storage');
  });
});

describe('DemoSandboxes eviction', () => {
  it('drops a sandbox untouched for the TTL; a returning session is seeded afresh', () => {
    const { sandboxes, clock } = make({ limits: { sandboxTtlMs: 1000 } });
    const a = sandboxes.get('a');
    a.createRun({ name: 'x', upload: upload(10), guide: TINY_GUIDE });
    clock.advance(600);
    sandboxes.get('b');
    clock.advance(600);
    sandboxes.get('b');
    expect(sandboxes.size).toBe(1);
    expect(sandboxes.get('a').runs.size).toBe(2);
  });

  it('touching refreshes the TTL', () => {
    const { sandboxes, clock } = make({ limits: { sandboxTtlMs: 1000 } });
    const a = sandboxes.get('a');
    clock.advance(800);
    expect(sandboxes.get('a')).toBe(a);
    clock.advance(800);
    expect(sandboxes.get('a')).toBe(a);
  });

  it('gives back an evicted sandbox uploaded bytes to the shared total', () => {
    const { sandboxes, clock } = make({
      limits: { sandboxTtlMs: 1000, sourceBytesTotal: 100 },
    });
    sandboxes.get('a').createRun({ name: 'x', upload: upload(90), guide: TINY_GUIDE });
    clock.advance(2000);
    const b = sandboxes.get('b');
    expect(code(() => b.createRun({ name: 'y', upload: upload(90), guide: TINY_GUIDE }))).toBe(
      'no error',
    );
  });

  it('drops the least recently touched sandbox past maxSandboxes', () => {
    const { sandboxes, clock } = make({ limits: { maxSandboxes: 2 } });
    const a = sandboxes.get('a');
    clock.advance(1);
    sandboxes.get('b');
    clock.advance(1);
    sandboxes.get('a');
    clock.advance(1);
    sandboxes.get('c');
    expect(sandboxes.size).toBe(2);
    expect(sandboxes.get('a')).toBe(a);
    expect(sandboxes.size).toBe(2);
  });
});
