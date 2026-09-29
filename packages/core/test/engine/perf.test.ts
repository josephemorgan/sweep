import { describe, expect, it } from 'vitest';
import { deriveRun } from '../../src/engine/derive.js';
import { deriveMetrics } from '../../src/engine/metrics.js';
import { END, type Category, type Guide, type Section, type Task } from '../../src/index.js';
import { progress } from '../helpers.js';

const GROUPS = 40;
const LEAVES_PER_GROUP = 49;
const TASKS = 10_000;
const CATEGORIES = 10;

function buildGuide(): { guide: Guide; leafIds: string[] } {
  const leafIds: string[] = [];
  const sections: Section[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    const children: Section[] = [];
    for (let l = 0; l < LEAVES_PER_GROUP; l += 1) {
      const id = `g${g}-l${l}`;
      const prev = leafIds[leafIds.length - 1];
      leafIds.push(id);
      children.push(section(id, [], prev === undefined ? [] : [prev]));
    }
    sections.push(section(`g${g}`, children, []));
  }
  const categories: Category[] = Array.from({ length: CATEGORIES }, (_, i) => ({
    id: `c${i}`,
    name: `Category ${i}`,
    about: '',
    tracked: true,
  }));
  const tasks: Task[] = [];
  const n = leafIds.length;
  for (let i = 0; i < TASKS; i += 1) {
    const count = 1 + (i % 3);
    const span = Math.floor(n / count);
    const windows = [];
    for (let w = 0; w < count; w += 1) {
      const from = (w * span + ((i * 7) % Math.max(1, span - 2))) % n;
      const until = Math.min(n - 1, from + 1 + (i % 2));
      const last = w === count - 1 && i % 5 === 0;
      windows.push({
        from: leafIds[from]!,
        until: last ? END : leafIds[until]!,
        home: leafIds[from]!,
      });
    }
    tasks.push({
      id: `t${i}`,
      title: `Task ${i}`,
      category: `c${i % CATEGORIES}`,
      how: null,
      windows,
      exclusive: null,
      spoiler: false,
      renamedFrom: [],
    });
  }
  const guide: Guide = {
    formatVersion: 1,
    game: 'perf',
    title: 'Perf',
    categories,
    sections,
    tasks,
  };
  return { guide, leafIds };
}

function section(id: string, children: Section[], all: string[]): Section {
  return {
    id,
    title: id,
    overview: '',
    walkthrough: null,
    requires: { all },
    spoiler: false,
    renamedFrom: [],
    children,
  };
}

describe('performance', () => {
  it('derives a 10,000-task guide with metrics in under 50 ms (median of 5)', () => {
    const { guide, leafIds } = buildGuide();
    expect(leafIds).toHaveLength(1960);
    expect(guide.tasks).toHaveLength(TASKS);
    const p = progress({ cleared: leafIds.slice(0, leafIds.length / 2) });
    const run = (): void => {
      const derived = deriveRun(guide, p);
      deriveMetrics(guide, p, derived);
    };
    run();
    run();
    const times: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const start = performance.now();
      run();
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[2]!, `runs (ms): ${times.map((t) => t.toFixed(1)).join(', ')}`).toBeLessThan(50);
  });
});
