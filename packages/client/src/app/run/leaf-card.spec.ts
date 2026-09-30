import { TestBed } from '@angular/core/testing';
import type { Guide } from '@sweep/core';
import { LANTERN_KEEP, RUN_ID, lanternKeepPayload } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { LeafCard } from './leaf-card';
import { RunActions } from './run-actions';
import { RunLayout } from './run-layout';

async function renderCard(leafId: string, progress = {}) {
  const actions = { requestClear: vi.fn(), requestPin: vi.fn(), unpin: vi.fn() };
  const harness = await setupRunStore(progress, [
    RunLayout,
    { provide: RunActions, useValue: actions },
  ]);
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
});
