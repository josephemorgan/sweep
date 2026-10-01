import { TestBed } from '@angular/core/testing';
import { deriveRun, emptyProgress, indexGuide, type RunView, type TaskStatus } from '@sweep/core';
import { LANTERN_KEEP } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { BottomBar } from './bottom-bar';
import { groupByHome } from './metric-groups';
import { RunActions } from './run-actions';
import { RunLayout } from './run-layout';

async function renderBar(progress = {}) {
  const harness = await setupRunStore(progress, [RunLayout, { provide: RunActions, useValue: {} }]);
  const fixture = TestBed.createComponent(BottomBar);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const metric = (name: string): HTMLButtonElement =>
    [...el.querySelectorAll('nav button')].find((b) =>
      b.textContent?.replace(/\s+/g, ' ').trim().startsWith(name),
    )! as HTMLButtonElement;
  return { ...harness, fixture, el, metric };
}

describe('groupByHome', () => {
  it('groups by the home of the open (or first live) window, in route order', () => {
    const index = indexGuide(LANTERN_KEEP);
    const view = deriveRun(LANTERN_KEEP, emptyProgress());
    expect(groupByHome(['lost-cat', 'marsh-herbs', 'ferry-passage'], index, view)).toEqual([
      { leafId: 'village', taskIds: ['lost-cat', 'ferry-passage'] },
      { leafId: 'marsh', taskIds: ['marsh-herbs'] },
    ]);
  });
});

describe('groupByHome stability (§5.3)', () => {
  const index = indexGuide(LANTERN_KEEP);
  const base = deriveRun(LANTERN_KEEP, emptyProgress());
  const homeOf = (status: TaskStatus): string | undefined => {
    const view = {
      ...base,
      tasks: new Map(base.tasks).set('lost-cat', status),
      windows: new Map(base.windows).set('lost-cat', ['upcoming', 'open']),
    } as RunView;
    return groupByHome(['lost-cat'], index, view)[0]?.leafId;
  };

  it('keeps a task under its open window home once it is done', () => {
    const open = homeOf({ kind: 'open', window: 1, secondChance: true });
    expect(open).toBe('epilogue');
    expect(homeOf({ kind: 'done' })).toBe(open);
  });

  it('keeps a task under the same home when it becomes not-chosen or dont-care', () => {
    expect(homeOf({ kind: 'not-chosen' })).toBe('epilogue');
    expect(homeOf({ kind: 'dont-care' })).toBe('epilogue');
  });
});

describe('BottomBar (§5.5)', () => {
  it('stays pinned to the bottom of the viewport', async () => {
    const { el } = await renderBar();
    const nav = el.querySelector('nav')!;
    expect(nav.classList).toContain('sticky');
    expect(nav.classList).toContain('bottom-0');
    expect(nav.classList).toContain('z-20');
  });

  it('shows the four metrics, emphasizing Closing and highlighting Last chance', async () => {
    const { metric } = await renderBar();
    expect(
      ['Here', 'Now', 'Closing', 'Last chance'].map((m) =>
        metric(m).textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['Here 3', 'Now 3', 'Closing 2', 'Last chance 1']);
    expect(metric('Closing').classList).toContain('font-semibold');
    expect(metric('Last chance').classList).toContain('text-last-chance');
    expect(metric('Last chance').classList).toContain('border-last-chance');
  });

  it('drops the amber treatment when Last chance is 0', async () => {
    const { metric, store, fixture } = await renderBar({ tracked: { quests: false } });
    store.categoryFilter.set('loot');
    await fixture.whenStable();
    const b = metric('Last chance');
    expect(b.textContent).toContain('0');
    expect(b.classList).not.toContain('text-last-chance');
    expect(b.classList).not.toContain('border-last-chance');
  });

  it('renders four 0 numbers with no tracked categories', async () => {
    const { el, store, fixture } = await renderBar({
      tracked: { story: false, quests: false, loot: false },
    });
    await fixture.whenStable();
    expect(store.metrics()).toBeDefined();
    const buttons = [...el.querySelectorAll('nav button')].slice(0, 4);
    expect(buttons.length).toBe(4);
    for (const b of buttons)
      expect(b.querySelector('span:last-child')?.textContent?.trim()).toBe('0');
  });

  it('has a funnel filter button labelled by the selection, accent only when filtered', async () => {
    const { el, fixture, store } = await renderBar({ tracked: { quests: false } });
    const filter = (): HTMLButtonElement =>
      el.querySelector('button[aria-label^="Filter categories"]')!;
    expect(filter().getAttribute('aria-label')).toBe('Filter categories: all tracked');
    expect(filter().classList).not.toContain('text-accent');
    expect(filter().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    store.categoryFilter.set('loot');
    await fixture.whenStable();
    expect(filter().getAttribute('aria-label')).toBe('Filter categories: Loot');
    expect(filter().classList).toContain('text-accent');
    expect(filter().classList).not.toContain('text-fg-muted');
  });

  it('uses no pill shapes', async () => {
    const { el } = await renderBar();
    expect(el.querySelector('.rounded-full')).toBeNull();
  });

  it('keeps a space between label and number so the accessible name reads "Here 3"', async () => {
    const { metric } = await renderBar();
    // Raw textContent, not whitespace-normalized: "HERE3" would be read as one word.
    expect(metric('Here').textContent).toContain('Here 3');
    expect(metric('Last chance').textContent).toContain('Last chance 1');
  });

  it('filters by one tracked category through the filter sheet', async () => {
    const { el, fixture, metric, store } = await renderBar({ tracked: { quests: false } });
    el.querySelector<HTMLButtonElement>('button[aria-label^="Filter categories"]')!.click();
    await fixture.whenStable();
    const options = [...el.querySelectorAll<HTMLButtonElement>('dialog[open] li button')];
    expect(options.map((o) => o.textContent?.trim())).toEqual(['All tracked', 'Story', 'Loot']);
    options[2]!.click();
    await fixture.whenStable();
    expect(store.categoryFilter()).toBe('loot');
    expect(metric('Here').textContent).toContain('1');
    expect(metric('Last chance').classList).not.toContain('text-last-chance');
  });

  it('marks the metrics and the filter as dialog openers', async () => {
    const { el, metric } = await renderBar({ tracked: { quests: false } });
    expect(metric('Here').getAttribute('aria-haspopup')).toBe('dialog');
    const filter = el.querySelector('button[aria-label^="Filter categories"]')!;
    expect(filter.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('falls back to all tracked when the selected category is untracked', async () => {
    const { el, fixture, store } = await renderBar({ tracked: { quests: false } });
    store.categoryFilter.set('loot');
    store.setTracked('loot', false);
    store.categoryFilter.set('loot');
    await fixture.whenStable();
    expect(
      el.querySelector('button[aria-label^="Filter categories"]')!.getAttribute('aria-label'),
    ).toBe('Filter categories: all tracked');
  });

  it('opens a sheet listing the metric tasks grouped by home section', async () => {
    const { el, fixture, metric } = await renderBar();
    metric('Now').click();
    await fixture.whenStable();
    const sheet = el.querySelector('dialog[open]')!;
    expect(sheet.querySelector('h2')?.textContent).toBe('Now');
    expect(sheet.querySelector('h3')?.textContent).toContain('Harrow Village');
    expect(sheet.textContent).toContain('Pay the ferryman');
  });
});
