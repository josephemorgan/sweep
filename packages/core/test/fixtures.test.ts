import { describe, expect, it } from 'vitest';
import { END, type Section } from '../src/index.js';
import { loadGuide, readFixture } from './helpers.js';

const WITH_MODEL = ['tiny-linear', 'botw-style', 'ff8-style', 'ff6-style', 'lantern-keep'];

function flatten(sections: readonly Section[]): Section[] {
  return sections.flatMap((s) => [s, ...flatten(s.children)]);
}

describe('valid fixtures', () => {
  it.each([...WITH_MODEL, 'ff6-sample'])('%s.yaml exists', (name) => {
    expect(readFixture(`valid/${name}.yaml`)).toMatch(/^(# .*\n)?sweep: 1\n/);
  });

  describe.each(WITH_MODEL)('%s.json', (name) => {
    const guide = loadGuide(name);
    const all = flatten(guide.sections);
    const sections = new Map(all.map((s) => [s.id, s]));
    const categories = new Set(guide.categories.map((c) => c.id));

    it('has formatVersion 1', () => {
      expect(guide.formatVersion).toBe(1);
    });

    it('has unique section and task IDs', () => {
      const ids = [...all.map((s) => s.id), ...guide.tasks.map((t) => t.id)];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('requires only sections', () => {
      for (const s of all) {
        const ids = 'all' in s.requires ? s.requires.all : s.requires.any;
        for (const id of ids) expect(sections.has(id), `${s.id} requires ${id}`).toBe(true);
      }
    });

    it('has windows that name sections, with leaf homes', () => {
      for (const t of guide.tasks) {
        for (const w of t.windows) {
          expect(sections.has(w.from), `${t.id} from ${w.from}`).toBe(true);
          if (w.until !== END) expect(sections.has(w.until), `${t.id} until ${w.until}`).toBe(true);
          expect(sections.get(w.home)?.children, `${t.id} home ${w.home}`).toEqual([]);
        }
      }
    });

    it('has tasks in defined categories', () => {
      for (const t of guide.tasks) expect(categories.has(t.category), t.id).toBe(true);
    });
  });
});
