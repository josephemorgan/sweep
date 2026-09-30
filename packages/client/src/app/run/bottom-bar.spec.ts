import { TestBed } from '@angular/core/testing';
import { deriveRun, emptyProgress, indexGuide } from '@sweep/core';
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

describe('BottomBar (§5.5)', () => {
  it('shows the four metrics, emphasizing CLOSING and highlighting LAST CHANCE', async () => {
    const { metric } = await renderBar();
    expect(
      ['HERE', 'NOW', 'CLOSING', 'LAST CHANCE'].map((m) =>
        metric(m).textContent?.replace(/\s+/g, ' ').trim(),
      ),
    ).toEqual(['HERE 3', 'NOW 3', 'CLOSING 2', 'LAST CHANCE 1']);
    expect(metric('CLOSING').classList).toContain('font-semibold');
    expect(metric('LAST CHANCE').classList).toContain('text-last-chance');
  });

  it('keeps a space between label and number so the accessible name reads "HERE 3"', async () => {
    const { metric } = await renderBar();
    // Raw textContent, not whitespace-normalized: "HERE3" would be read as one word.
    expect(metric('HERE').textContent).toContain('HERE 3');
    expect(metric('LAST CHANCE').textContent).toContain('LAST CHANCE 1');
  });

  it('filters by one tracked category', async () => {
    const { el, fixture, metric, store } = await renderBar({ tracked: { quests: false } });
    const select = el.querySelector('select')!;
    expect([...select.options].map((o) => o.text)).toEqual(['All tracked', 'Story', 'Loot']);
    select.value = 'loot';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(store.categoryFilter()).toBe('loot');
    expect(metric('HERE').textContent).toContain('1');
    expect(metric('LAST CHANCE').classList).not.toContain('text-last-chance');
  });

  it('marks the metrics as dialog openers and binds the chip value', async () => {
    const { el, fixture, metric, store } = await renderBar({ tracked: { quests: false } });
    expect(metric('HERE').getAttribute('aria-haspopup')).toBe('dialog');
    const select = el.querySelector('select')!;
    store.categoryFilter.set('quests');
    await fixture.whenStable();
    expect(select.value).toBe('');
    store.categoryFilter.set('loot');
    await fixture.whenStable();
    expect(select.value).toBe('loot');
  });

  it('opens a sheet listing the metric tasks grouped by home section', async () => {
    const { el, fixture, metric } = await renderBar();
    metric('NOW').click();
    await fixture.whenStable();
    const sheet = el.querySelector('dialog[open]')!;
    expect(sheet.querySelector('h2')?.textContent).toBe('NOW');
    expect(sheet.querySelector('h3')?.textContent).toContain('Harrow Village');
    expect(sheet.textContent).toContain('Pay the ferryman');
  });
});
