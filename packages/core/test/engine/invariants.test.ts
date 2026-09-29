import { describe, expect, it } from 'vitest';
import { clearImpact } from '../../src/engine/clear-impact.js';
import { deriveRun } from '../../src/engine/derive.js';
import { deriveMetrics } from '../../src/engine/metrics.js';
import type { Guide, TaskState } from '../../src/index.js';
import { loadGuide, progress } from '../helpers.js';

const SEED = 42;
const SNAPSHOTS = 200;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function allSections(guide: Guide): { id: string; leaf: boolean }[] {
  const out: { id: string; leaf: boolean }[] = [];
  const walk = (list: Guide['sections']): void => {
    for (const s of list) {
      out.push({ id: s.id, leaf: s.children.length === 0 });
      walk(s.children);
    }
  };
  walk(guide.sections);
  return out;
}

const NAMES = ['lantern-keep', 'tiny-linear', 'ff6-style', 'ff8-style', 'botw-style'] as const;

describe.each(NAMES)('invariants on %s', (name) => {
  const guide = loadGuide(name);
  const sections = allSections(guide);
  const leaves = sections.filter((s) => s.leaf).map((s) => s.id);

  it(`holds over ${SNAPSHOTS} random snapshots (seed ${SEED})`, () => {
    const rand = mulberry32(SEED);
    for (let n = 0; n < SNAPSHOTS; n += 1) {
      const ctx = `seed ${SEED}, snapshot ${n}`;
      const density = rand();
      const cleared = leaves.filter(() => rand() < density);
      const r = rand();
      const pin = r < 0.3 ? null : sections[Math.floor(rand() * sections.length)]!.id;
      const tasks: Record<string, TaskState> = {};
      for (const t of guide.tasks) {
        const x = rand();
        if (x < 0.15) tasks[t.id] = 'done';
        else if (x < 0.25) tasks[t.id] = 'dont-care';
      }
      const tracked: Record<string, boolean> = {};
      for (const c of guide.categories) if (rand() < 0.3) tracked[c.id] = rand() < 0.5;
      const p = progress({ cleared, pin, tasks, tracked });
      const run = deriveRun(guide, p);

      for (const filter of [null, ...guide.categories.map((c) => c.id)]) {
        const m = deriveMetrics(guide, p, run, filter);
        const label = `${ctx}, filter ${String(filter)}`;
        let expectedClosing = 0;
        let expectedLast = 0;
        if (run.current !== null) {
          const impact = clearImpact(guide, p, run.current);
          const keep = (taskId: string): boolean => {
            const cat = guide.tasks.find((t) => t.id === taskId)!.category;
            return run.tracked.has(cat) && (filter === null || filter === cat);
          };
          expectedClosing = impact.closing.filter((c) => keep(c.taskId)).length;
          expectedLast = impact.lastChance.filter((c) => keep(c.taskId)).length;
        }
        expect(m.closing, label).toBe(expectedClosing);
        expect(m.lastChance, label).toBe(expectedLast);
        expect(m.lastChance, label).toBeLessThanOrEqual(m.closing);
        expect(m.here, label).toBeLessThanOrEqual(m.now);
      }

      for (const card of run.cards.values()) {
        const ids = new Set<string>();
        for (const cat of card.categories) {
          expect(cat.done, ctx).toBeGreaterThanOrEqual(0);
          expect(cat.done, ctx).toBeLessThanOrEqual(cat.total);
          expect(cat.total, ctx).toBeLessThanOrEqual(cat.rows.length);
          expect(cat.missed, ctx).toBeLessThanOrEqual(cat.rows.length);
          for (const row of cat.rows) {
            expect(
              ids.has(row.taskId),
              `${ctx}: ${row.taskId} listed twice on ${card.leafId}`,
            ).toBe(false);
            ids.add(row.taskId);
          }
        }
      }
    }
  });
});
