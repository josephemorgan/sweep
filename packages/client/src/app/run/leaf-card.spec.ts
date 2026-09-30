import { TestBed } from '@angular/core/testing';
import type { Guide } from '@sweep/core';
import { LANTERN_KEEP, RUN_ID, lanternKeepPayload } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { LeafCard } from './leaf-card';
import { RunActions } from './run-actions';
import { RunLayout } from './run-layout';

async function renderCard(
  leafId: string,
  progress = {},
  guide?: Guide,
  variant: 'row' | 'panel' = 'panel',
) {
  const actions = { requestClear: vi.fn(), requestPin: vi.fn(), unpin: vi.fn() };
  const harness = await setupRunStore(progress, [
    RunLayout,
    { provide: RunActions, useValue: actions },
  ]);
  if (guide) {
    harness.api.getRun.mockResolvedValue({ ...lanternKeepPayload(progress), guide });
    await harness.store.open(RUN_ID);
  }
  const fixture = TestBed.createComponent(LeafCard);
  fixture.componentRef.setInput('leafId', leafId);
  fixture.componentRef.setInput('variant', variant);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (name: string): HTMLButtonElement | undefined =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  return { ...harness, fixture, el, actions, button, layout: TestBed.inject(RunLayout) };
}

describe('LeafCard (§5.2)', () => {
  it('expands the current card with counts, walkthrough and actions', async () => {
    const { el, button, actions } = await renderCard('village');
    expect(el.querySelector('section')?.getAttribute('aria-label')).toBe('Harrow Village');
    expect(el.querySelector('section')?.getAttribute('data-state')).toBe('current');
    expect(el.textContent).toContain('3 open');
    expect(el.textContent).toContain('Stock up and find passage across the river.');
    const summaries = [...el.querySelectorAll('details > summary')].map((s) =>
      s.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(summaries).toEqual(['Walkthrough', 'Story 0/1', 'Loot 0/1', 'Side quests 0/1']);
    expect((el.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    button('Clear section')!.click();
    button("I'm here")!.click();
    expect(actions.requestClear).toHaveBeenCalledWith('village');
    expect(actions.requestPin).toHaveBeenCalledWith('village');
  });

  it('shows a locked card collapsed, naming its requirement without spoiling it (Review Focus 5)', async () => {
    const { el } = await renderCard('epilogue');
    expect(el.querySelector('section')?.getAttribute('data-state')).toBe('locked');
    expect(el.textContent).toContain('Requires: a hidden section');
    expect(el.textContent).not.toContain('Throne Room');
    expect(el.textContent).not.toContain('Return to the village');
  });

  it('checks a task through the store', async () => {
    const { el, fixture, store } = await renderCard('village');
    (el.querySelector('input[aria-label="Pay the ferryman"]') as HTMLInputElement).click();
    await fixture.whenStable();
    expect(store.view()?.tasks.get('ferry-passage')).toEqual({ kind: 'done' });
    expect(el.textContent).toContain('Story 1/1');
  });

  it('keeps a resolved 2nd-chance row until the card collapses (§5.3)', async () => {
    const { el, fixture, store, layout } = await renderCard('epilogue', { cleared: ['village'] });
    layout.setExpanded('epilogue', true);
    await fixture.whenStable();
    store.setTaskState('lost-cat', 'done');
    await fixture.whenStable();
    expect(el.querySelector('input[aria-label="Find the elder\'s cat"]')).not.toBeNull();
    layout.setExpanded('epilogue', false);
    await fixture.whenStable();
    layout.setExpanded('epilogue', true);
    await fixture.whenStable();
    expect(el.querySelector('input[aria-label="Find the elder\'s cat"]')).toBeNull();
  });

  it('offers Reopen on a cleared card, and Unpin on the pinned current card', async () => {
    const { button, fixture, layout, queue, actions } = await renderCard('village', {
      cleared: ['village'],
    });
    layout.setExpanded('village', true);
    await fixture.whenStable();
    button('Reopen section')!.click();
    expect(queue.pending().at(-1)).toEqual({
      kind: 'section',
      runId: RUN_ID,
      sectionId: 'village',
      cleared: false,
    });
    TestBed.resetTestingModule();
    const pinned = await renderCard('marsh', { pin: 'marsh' });
    pinned.button('Unpin')!.click();
    expect(pinned.actions.unpin).toHaveBeenCalled();
    expect(actions.unpin).not.toHaveBeenCalled();
  });

  it("offers I'm here, not Unpin, on a derived (unpinned) current card", async () => {
    const { button, fixture, layout } = await renderCard('village');
    layout.setExpanded('village', true);
    await fixture.whenStable();
    expect(button("I'm here")).toBeTruthy();
    expect(button('Unpin')).toBeFalsy();
  });

  it('does not spoil a hidden section named as the next chance (spoiler-safe label)', async () => {
    const guide = structuredClone(LANTERN_KEEP) as Guide;
    const second = guide.tasks.find((t) => t.id === 'lost-cat')!.windows[1]!;
    second.from = 'throne-room';
    second.home = 'throne-room';
    const { el, fixture, api, store } = await renderCard('village');
    api.getRun.mockResolvedValue({ ...lanternKeepPayload({ cleared: ['village'] }), guide });
    await store.open(RUN_ID);
    TestBed.inject(RunLayout).setExpanded('village', true);
    await fixture.whenStable();
    expect(el.textContent).toContain('a hidden section');
    expect(el.textContent).not.toContain('Throne Room');
  });

  const ALL_BUT_EPILOGUE = [
    'village',
    'marsh',
    'keep-gate',
    'east-tower',
    'west-tower',
    'throne-room',
  ];
  const CAT = 'input[aria-label="Find the elder\'s cat"]';

  it('ends sticky rows when a refetch collapses the card and later re-expands it', async () => {
    const { el, fixture, api, store } = await renderCard('epilogue', {
      cleared: ALL_BUT_EPILOGUE,
    });
    expect(el.querySelector('section')?.getAttribute('data-state')).toBe('current');
    expect(el.querySelector(CAT)).not.toBeNull();
    api.getRun.mockResolvedValue(lanternKeepPayload({ cleared: ALL_BUT_EPILOGUE.slice(0, -1) }));
    await store.refetch();
    await fixture.whenStable();
    expect(el.querySelector('section')?.getAttribute('data-state')).toBe('locked');
    api.getRun.mockResolvedValue(
      lanternKeepPayload({ cleared: ALL_BUT_EPILOGUE, tasks: { 'lost-cat': 'done' } }),
    );
    await store.refetch();
    await fixture.whenStable();
    expect(el.querySelector('section')?.getAttribute('data-state')).toBe('current');
    expect(el.querySelector(CAT)).toBeNull();
  });

  it('survives a guide swap that removes a task shown on an expanded card', async () => {
    const { el, fixture, api, store } = await renderCard('epilogue', {
      cleared: ALL_BUT_EPILOGUE,
    });
    expect(el.querySelector(CAT)).not.toBeNull();
    const guide = structuredClone(LANTERN_KEEP) as Guide;
    guide.tasks = guide.tasks.filter((t) => t.id !== 'lost-cat');
    const payload = lanternKeepPayload({ cleared: ALL_BUT_EPILOGUE });
    api.getRun.mockResolvedValue({ ...payload, run: { ...payload.run, currentVersion: 2 }, guide });
    await store.refetch();
    await fixture.whenStable();
    expect(el.querySelector(CAT)).toBeNull();
    expect(el.textContent).toContain('Epilogue');
  });

  it('shows a cleared card collapsed and struck through', async () => {
    const { el, button } = await renderCard('village', { cleared: ['village'] });
    expect(el.querySelector('section')?.getAttribute('data-state')).toBe('cleared');
    expect(el.querySelector('section > div button')?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.line-through')?.textContent).toContain('Harrow Village');
    expect(button('Reopen section')).toBeUndefined();
  });

  it('names an any-of requirement without spoiling hidden sections', async () => {
    const guide = structuredClone(LANTERN_KEEP) as Guide;
    guide.sections.find((s) => s.id === 'epilogue')!.requires = {
      any: ['west-tower', 'throne-room'],
    };
    const { el } = await renderCard('epilogue', {}, guide);
    expect(el.textContent).toContain('Requires one of: West Tower, a hidden section');
  });

  it('leaves untracked categories off the card', async () => {
    const { el } = await renderCard('village', { tracked: { quests: false } });
    const summaries = [...el.querySelectorAll('details > summary')].map((s) =>
      s.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(summaries).toEqual(['Walkthrough', 'Story 0/1', 'Loot 0/1']);
  });

  it('points the disclosure at the expanded body', async () => {
    const { el, layout, fixture } = await renderCard('village');
    const toggle = el.querySelector('section > div button') as HTMLButtonElement;
    const id = toggle.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(el.querySelector(`#${id}`)).not.toBeNull();
    layout.setExpanded('village', false);
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-controls')).toBeNull();
  });

  it('redacts a hidden section title with a bar and keeps the text out of the name', async () => {
    const { el } = await renderCard('throne-room');
    const header = el.querySelector('section > div button')!;
    expect(header.querySelector('.redaction')).not.toBeNull();
    expect(header.textContent).toContain('tap to reveal');
    expect(el.querySelector('section')!.getAttribute('aria-label')).toBe('Hidden section');
    expect(header.querySelector('.blur-md')).toBeNull();
  });

  it('keeps the hint out of the toggle name and labels the locked overview as a section spoiler', async () => {
    const { el, fixture, layout } = await renderCard('throne-room');
    const toggle = el.querySelector('section > div button')!;
    const hint = [...toggle.querySelectorAll('span')].find(
      (n) => n.textContent === 'tap to reveal',
    )!;
    expect(hint.getAttribute('aria-hidden')).toBe('true');
    layout.setExpanded('throne-room', true);
    await fixture.whenStable();
    expect(el.querySelector('p button')?.getAttribute('aria-label')).toBe(
      'Hidden spoiler section. Tap to reveal.',
    );
  });
});

describe('LeafCard plumbing (route)', () => {
  it('shows the hint in place of the lock text', async () => {
    const { el, fixture } = await renderCard('epilogue', {}, undefined, 'row');
    fixture.componentRef.setInput('hint', 'Opens after Somewhere');
    await fixture.whenStable();
    expect(el.textContent).toContain('Opens after Somewhere');
    expect(el.textContent).not.toContain('Requires:');
    expect(el.querySelector('[data-hint]')!.className).toContain('text-fg-muted');
  });

  it('with detailPane, header click emits select and does not expand; selected is highlighted', async () => {
    const { el, fixture, layout } = await renderCard('marsh', {}, undefined, 'row');
    const selected: unknown[] = [];
    fixture.componentInstance.select.subscribe(() => selected.push(true));
    fixture.componentRef.setInput('detailPane', true);
    fixture.componentRef.setInput('selected', true);
    await fixture.whenStable();
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(selected.length).toBe(1);
    expect(layout.isExpanded('marsh')).toBe(false);
    const section = el.querySelector('section')!;
    expect(section.className).toContain('bg-surface-raised');
    expect(section.className).toContain('rounded-l-panel');
    expect(section.classList.contains('rounded-panel')).toBe(false);
    expect(el.querySelector('.text-lamp.font-display')).not.toBeNull();
  });
});

describe('LeafCard rows (route)', () => {
  const node = (el: HTMLElement): HTMLElement => el.querySelector('[data-node] > span')!;
  const row = (el: HTMLElement): HTMLElement => el.querySelector('section > div button')!;

  it('renders a cleared leaf as a 36 px struck-through row with the cleared dot', async () => {
    const { el } = await renderCard('village', { cleared: ['village'] }, undefined, 'row');
    expect(row(el).className).toContain('h-9');
    expect(row(el).className).toContain('text-fg-cleared');
    expect(el.querySelector('.line-through')!.className).toContain('decoration-rail-dot');
    const n = node(el);
    expect(n.className).toContain('bg-rail-dot');
    expect(n.className).toContain('size-2');
    expect(n.className).toContain('rounded-full');
    expect(el.querySelector('[data-node]')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('details')).toBeNull();
  });

  it('renders an unlocked leaf with a solid ring and its open count', async () => {
    const { el } = await renderCard(
      'west-tower',
      { cleared: ['village', 'marsh', 'keep-gate'] },
      undefined,
      'row',
    );
    expect(row(el).className).toContain('min-h-11');
    expect(node(el).className).toContain('border-rail-ring');
    expect(node(el).className).toContain('border-solid');
    expect(node(el).className).not.toContain('border-dashed');
    expect(row(el).className).toContain('gap-2.5');
    expect(row(el).className).toContain('pl-3');
    expect(row(el).className).toContain('pr-4');
    const count = [...el.querySelectorAll('span')].find((n) =>
      / open$/.test(n.textContent!.trim()),
    );
    expect(count?.className).toContain('text-[13px]');
    expect(count?.className).toContain('text-open');
  });

  it('renders a locked leaf with a dashed ring, muted text and the reason line', async () => {
    const { el } = await renderCard('epilogue', {}, undefined, 'row');
    expect(node(el).className).toContain('border-dashed');
    expect(row(el).className).toContain('text-fg-muted');
    expect(row(el).textContent).toContain('Locked:');
    expect(row(el).textContent).toContain('Requires: a hidden section');
    expect(el.querySelector('svg')).toBeNull();
  });

  it('shows the hint under the title of a next row', async () => {
    const { el, fixture } = await renderCard('epilogue', {}, undefined, 'row');
    fixture.componentRef.setInput('hint', 'Opens after Somewhere');
    await fixture.whenStable();
    expect(el.querySelector('[data-hint]')!.className).toContain('text-xs');
    expect(row(el).textContent).not.toContain('Requires:');
  });

  it('renders the current leaf as a row with the lamp when not expanded', async () => {
    const { el } = await renderCard('village', {}, undefined, 'row');
    const n = node(el);
    expect(n.className).toContain('bg-lamp');
    expect(n.getAttribute('style')).toContain('--color-rail-ring');
    expect(el.querySelector('details')).toBeNull();
    expect(el.textContent).not.toContain('Clear section');
  });

  it('shows the pinned indicator as plain text', async () => {
    const { el } = await renderCard('marsh', { pin: 'marsh' }, undefined, 'row');
    const pinned = [...el.querySelectorAll('span')].find((n) => n.textContent === 'Pinned')!;
    expect(pinned.className).toContain('text-accent');
    expect(pinned.className).not.toContain('border');
  });

  it('renders the compact current row in the detail pane', async () => {
    const { el, fixture } = await renderCard('marsh', {}, undefined, 'row');
    fixture.componentRef.setInput('detailPane', true);
    fixture.componentRef.setInput('selected', true);
    await fixture.whenStable();
    expect(row(el).classList.contains('min-h-11')).toBe(true);
    expect(row(el).classList.contains('h-11')).toBe(false);
    expect(node(el).className).toContain('border-rail-ring');
    expect(node(el).className).not.toContain('bg-lamp');
    const title = el.querySelector('.font-display')!;
    expect(title.className).toContain('font-semibold');
    expect(title.className).toContain('text-[15px]');
    expect(title.className).toContain('text-lamp');
    expect(title.className).not.toContain('text-sm');
  });

  it('expands a cleared row to a panel with Reopen and no lamp, then collapses', async () => {
    const { el, fixture, layout, button } = await renderCard(
      'village',
      { cleared: ['village'] },
      undefined,
      'row',
    );
    row(el).click();
    expect(layout.isExpanded('village')).toBe(true);
    fixture.componentRef.setInput('variant', 'panel');
    await fixture.whenStable();
    expect(button('Reopen section')).toBeTruthy();
    expect(node(el).className).toContain('bg-rail-dot');
    expect(el.querySelector('.bg-lamp')).toBeNull();
    row(el).click();
    expect(layout.isExpanded('village')).toBe(false);
  });

  it('uses no shadow utility and no rounded-full outside the nodes', async () => {
    for (const [id, progress] of [
      ['village', {}],
      ['village', { cleared: ['village'] }],
      ['epilogue', {}],
    ] as const) {
      TestBed.resetTestingModule();
      const { el } = await renderCard(id, progress, undefined, 'row');
      for (const n of el.querySelectorAll('*')) {
        expect(n.className.toString()).not.toMatch(/(^|\s)shadow-/);
        if (n.className.toString().includes('rounded-full')) {
          expect(n.closest('[data-node]')).not.toBeNull();
        }
      }
    }
  });
});
