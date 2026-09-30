import { TestBed } from '@angular/core/testing';
import type { GuideDiff, ItemLabel, KindDiff, ProgressDto } from '@sweep/core';
import { setupRunStore } from '../../testing/run-store-harness';
import { DiffPreview, isEmptyDiff } from './diff-preview';
import { Reveals } from './reveals';
import { taskRevealKey } from './spoiler';

const HIDDEN = 'button[aria-label="Hidden spoiler. Tap to reveal."]';
const kind = (over: Partial<KindDiff> = {}): KindDiff => ({
  added: [],
  removed: [],
  edited: [],
  renamed: [],
  ...over,
});
const item = (title: string, spoiler = false): ItemLabel => ({ title, spoiler });
const diff = (over: Partial<GuideDiff> = {}): GuideDiff => ({
  sections: kind(),
  tasks: kind(),
  categories: kind(),
  likelyRegenerated: false,
  progress: { migrated: [], orphaned: [], restored: [] },
  labels: { sections: {}, tasks: {}, categories: {} },
  ...over,
});

async function renderDiff(value: GuideDiff, progress: Partial<ProgressDto> = {}) {
  await setupRunStore(progress);
  const fixture = TestBed.createComponent(DiffPreview);
  fixture.componentRef.setInput('diff', value);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { el, fixture, text: el.textContent?.replace(/\s+/g, ' ') ?? '' };
}

describe('DiffPreview (§5.8)', () => {
  it('says there is nothing to apply for an identical file', async () => {
    expect(isEmptyDiff(diff())).toBe(true);
    const { text } = await renderDiff(diff());
    expect(text).toContain('No changes');
  });

  it('counts per kind, names edited fields, shows renames and progress effects', async () => {
    const value = diff({
      tasks: kind({
        added: ['bell-rope'],
        edited: [{ id: 'village-chest', fields: ['how'] }],
        renamed: [{ from: 'lost-cat', to: 'elder-cat', fields: [] }],
      }),
      progress: {
        migrated: [{ kind: 'task', from: 'lost-cat', to: 'elder-cat' }],
        orphaned: [],
        restored: [],
      },
      labels: {
        sections: {},
        tasks: {
          'bell-rope': item('Pull the bell rope'),
          'village-chest': item('Chest behind the mill'),
          'elder-cat': item("Find the elder's cat"),
          'lost-cat': item("Find the elder's cat"),
        },
        categories: {},
      },
    });
    expect(isEmptyDiff(value)).toBe(false);
    const { el, text } = await renderDiff(value);
    expect(text).toContain('Tasks: 1 added · 1 edited · 0 removed · 1 renamed');
    expect(text).toContain('Pull the bell rope');
    expect(text).toContain('Chest behind the mill — how');
    expect(text).toContain("Find the elder's cat → Find the elder's cat");
    expect(text).toContain(
      '1 entry migrated through renames; 0 orphaned (kept, restored if the IDs return); 0 restored',
    );
    expect(el.querySelector(HIDDEN)).toBeNull();
    expect([...el.querySelectorAll('details')].every((d) => !d.open)).toBe(true);
  });

  it('blurs a spoiler-flagged added task and reveals it on tap', async () => {
    const { el, fixture, text } = await renderDiff(
      diff({
        tasks: kind({ added: ['hidden-door'] }),
        labels: {
          sections: {},
          tasks: { 'hidden-door': item('The door behind the throne', true) },
          categories: {},
        },
      }),
    );
    expect(text).toContain('Tasks: 1 added');
    const button = el.querySelector<HTMLButtonElement>(HIDDEN)!;
    expect(button.querySelector('.sr-only[aria-hidden="true"]')?.textContent).toBe(
      'The door behind the throne',
    );
    button.click();
    await fixture.whenStable();
    expect(el.querySelector(HIDDEN)).toBeNull();
    expect(el.textContent).toContain('The door behind the throne');
    expect(TestBed.inject(Reveals).has(taskRevealKey('hidden-door'))).toBe(true);
  });

  it('shows a non-spoiler added section in plain text', async () => {
    const { el, text } = await renderDiff(
      diff({
        sections: kind({ added: ['bell-tower'] }),
        labels: { sections: { 'bell-tower': item('Bell Tower') }, tasks: {}, categories: {} },
      }),
    );
    expect(text).toContain('Sections: 1 added · 0 edited · 0 removed · 0 renamed');
    expect(text).toContain('Bell Tower');
    expect(el.querySelector(HIDDEN)).toBeNull();
  });

  it("names removed IDs with the old guide's label, blurring a spoiler section that is still locked", async () => {
    // The titles come from diff.labels (core takes a removed ID's label from the old guide), never
    // from the run's own guide: "Old Whisper Marsh" isn't Lantern Keep's title for `marsh`.
    const { el, text } = await renderDiff(
      diff({
        sections: kind({ removed: ['marsh', 'throne-room'] }),
        labels: {
          sections: { marsh: item('Old Whisper Marsh'), 'throne-room': item('Throne Room', true) },
          tasks: {},
          categories: {},
        },
      }),
    );
    expect(text).toContain('Old Whisper Marsh');
    expect(el.querySelector(HIDDEN)?.textContent).toContain('Throne Room');
  });

  it('shows a spoiler task plainly once it is done in this run (§5.6)', async () => {
    const { el, text } = await renderDiff(
      diff({
        tasks: kind({ edited: [{ id: 'keepers-lantern', fields: ['how'] }] }),
        labels: {
          sections: {},
          tasks: { 'keepers-lantern': item("The keeper's lantern", true) },
          categories: {},
        },
      }),
      { tasks: { 'keepers-lantern': 'done' } },
    );
    expect(text).toContain("The keeper's lantern — how");
    expect(el.querySelector(HIDDEN)).toBeNull();
  });

  it('warns prominently about a likely regeneration', async () => {
    const { el } = await renderDiff(
      diff({
        likelyRegenerated: true,
        tasks: kind({ removed: ['ferry-passage'] }),
        progress: {
          migrated: [],
          orphaned: [
            { kind: 'task', id: 'a' },
            { kind: 'cleared', id: 'b' },
          ],
          restored: [],
        },
        labels: {
          sections: {},
          tasks: { 'ferry-passage': item('Pay the ferryman') },
          categories: {},
        },
      }),
    );
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Most IDs changed. Was this guide regenerated? Progress for 2 items will be orphaned.',
    );
  });
  it('uses the source state for a rename target', async () => {
    const value = diff({
      tasks: kind({ renamed: [{ from: 'keepers-lantern', to: 'new-lantern', fields: [] }] }),
      labels: {
        sections: {},
        tasks: {
          'keepers-lantern': item('Old lantern', true),
          'new-lantern': item('New lantern', true),
        },
        categories: {},
      },
    });
    const done = await renderDiff(value, { tasks: { 'keepers-lantern': 'done' } });
    expect(done.el.querySelector(HIDDEN)).toBeNull();
    expect(done.text).toContain('Old lantern → New lantern');
  });

  it('falls back to neutral text for unlabelled IDs, never an inherited property', async () => {
    const { text } = await renderDiff(
      diff({
        tasks: kind({ added: ['constructor', 'toString'] }),
        sections: kind({ removed: ['__proto__'] }),
      }),
    );
    expect(text).toContain('constructor');
    expect(text).not.toContain('function');
    expect(text).not.toContain('[object');
  });

  it('leaks no hidden spoiler title outside aria-hidden nodes, labels or titles', async () => {
    const secret = ['Secret task', 'Secret section', 'Secret renamed', 'Secret edited'] as const;
    const { el } = await renderDiff(
      diff({
        tasks: kind({
          added: ['a'],
          edited: [{ id: 'd', fields: ['how'] }],
          renamed: [{ from: 'b', to: 'c', fields: [] }],
        }),
        sections: kind({ removed: ['s'] }),
        labels: {
          sections: { s: item(secret[1], true) },
          tasks: {
            a: item(secret[0], true),
            b: item(secret[2], true),
            c: item(secret[2], true),
            d: item(secret[3], true),
          },
          categories: {},
        },
      }),
    );
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    const attrs = [...clone.querySelectorAll('[aria-label],[title]')]
      .map((n) => `${n.getAttribute('aria-label')} ${n.getAttribute('title')}`)
      .join(' ');
    const visible = `${clone.textContent} ${attrs}`;
    for (const s of secret) expect(visible).not.toContain(s);
    expect(el.querySelectorAll(HIDDEN).length).toBeGreaterThan(3);
  });
});
