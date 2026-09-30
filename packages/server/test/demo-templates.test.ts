import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { loadDemoTemplates } from '../src/demo/templates.js';
import { indexGuide } from '../src/runs/guide-index.js';

const SHIPPED_GUIDES = new URL('../demo/guides/', import.meta.url);
const tempDirs: string[] = [];

async function tempDemoDir(manifest: unknown): Promise<URL> {
  const dir = await mkdtemp(join(tmpdir(), 'sweep-demo-'));
  tempDirs.push(dir);
  await mkdir(join(dir, 'guides'));
  await cp(new URL('lantern-keep.yaml', SHIPPED_GUIDES), join(dir, 'guides', 'lantern-keep.yaml'));
  await writeFile(join(dir, 'runs.json'), JSON.stringify(manifest));
  return pathToFileURL(`${dir}/`);
}

const run = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  name: 'Test run',
  file: 'lantern-keep.yaml',
  createdDaysAgo: 1,
  playedHoursAgo: 1,
  pin: null,
  cleared: [],
  tasks: {},
  tracked: {},
  ...overrides,
});

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('demo templates', () => {
  it('loads the shipped manifest with valid progress', async () => {
    const templates = await loadDemoTemplates();
    expect(templates).toHaveLength(4);
    for (const t of templates) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.version.guide.sections.length).toBeGreaterThan(0);
      expect(t.version.bytes).toBe(Buffer.byteLength(t.version.source));
      const index = indexGuide(t.version.guide);
      for (const id of t.progress.cleared) expect(index.leaves.has(id)).toBe(true);
      if (t.progress.pin !== null) expect(index.leaves.has(t.progress.pin)).toBe(true);
      for (const id of t.progress.tasks.keys()) expect(index.tasks.has(id)).toBe(true);
      for (const id of t.progress.tracked.keys()) expect(index.categories.has(id)).toBe(true);
    }
    expect(templates.some((t) => t.progress.cleared.size > 0)).toBe(true);
    expect(templates.some((t) => [...t.progress.tasks.values()].includes('done'))).toBe(true);
  });

  it('accepts a valid manifest from another directory', async () => {
    const dir = await tempDemoDir([run({ cleared: ['village'], pin: 'marsh' })]);
    const [t] = await loadDemoTemplates({ dir });
    expect(t?.progress.cleared.has('village')).toBe(true);
    expect(t?.createdAgoMs).toBe(86_400_000);
    expect(t?.playedAgoMs).toBe(3_600_000);
  });

  it('rejects an unknown id, naming it', async () => {
    const dir = await tempDemoDir([run({ cleared: ['nowhere'] })]);
    await expect(loadDemoTemplates({ dir })).rejects.toThrow(/nowhere/);
  });

  it('rejects a leaf used as a task and a group used as a cleared leaf', async () => {
    const asTask = await tempDemoDir([run({ tasks: { village: 'done' } })]);
    await expect(loadDemoTemplates({ dir: asTask })).rejects.toThrow(/village.*task/);
    const asLeaf = await tempDemoDir([run({ cleared: ['act-1'] })]);
    await expect(loadDemoTemplates({ dir: asLeaf })).rejects.toThrow(/act-1.*leaf/);
  });

  it('rejects a malformed manifest', async () => {
    const dir = await tempDemoDir([run({ extra: true })]);
    await expect(loadDemoTemplates({ dir })).rejects.toThrow();
  });
});
