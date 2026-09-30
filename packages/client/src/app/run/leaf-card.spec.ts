import { TestBed } from '@angular/core/testing';
import type { Guide } from '@sweep/core';
import { LANTERN_KEEP, RUN_ID, lanternKeepPayload } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { LeafCard } from './leaf-card';
import { RunActions } from './run-actions';
import { RunLayout } from './run-layout';

async function renderCard(leafId: string, progress = {}, guide?: Guide) {
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
});
