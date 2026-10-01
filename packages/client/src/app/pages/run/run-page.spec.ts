import type { DebugElement } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SheetStack } from '../../shared/sheet-stack';
import { Toasts } from '../../shared/toasts';
import { RUN_ID, lanternKeepPayload } from '../../../testing/lantern-keep';
import { ResumeCache } from '../../run/resume-cache';
import { setupRunStore } from '../../../testing/run-store-harness';
import { By } from '@angular/platform-browser';
import { SectionList } from '../../run/section-list';
import { RunLayout } from '../../run/run-layout';
import { RunPage } from './run-page';

async function renderPage(progress = {}) {
  Element.prototype.scrollIntoView = vi.fn();
  const harness = await setupRunStore(progress);
  const fixture = TestBed.createComponent(RunPage);
  fixture.componentRef.setInput('runId', RUN_ID);
  await fixture.whenStable();
  return { ...harness, fixture, el: fixture.nativeElement as HTMLElement };
}

describe('RunPage', () => {
  it('renders group headings and leaf cards, and scrolls to the current card', async () => {
    const { el } = await renderPage({ cleared: ['village'] });
    expect(el.querySelector('h1')?.textContent).toContain('LK run');
    const headings = [...el.querySelectorAll('[role="heading"][aria-level="2"]')].map((h) =>
      h.textContent?.trim(),
    );
    expect(headings.some((h) => h?.includes('Act 1'))).toBe(true);
    expect(el.querySelector('#section-marsh')?.getAttribute('data-state')).toBe('current');
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect((vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0] as HTMLElement).id).toBe(
      'section-marsh',
    );
  });

  it('shows the list and scrolls to the current card from the resume cache, before the server answers', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { store, api } = await setupRunStore();
    store.close();
    TestBed.inject(ResumeCache).write(lanternKeepPayload({ cleared: ['village'] }));
    api.getRun.mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(RunPage);
    fixture.componentRef.setInput('runId', RUN_ID);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('#section-marsh')).not.toBeNull();
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect((vi.mocked(Element.prototype.scrollIntoView).mock.contexts[0] as HTMLElement).id).toBe(
      'section-marsh',
    );
  });

  it('scrolls once on open even when the server copy changes the view and a task is toggled', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { store, api } = await setupRunStore();
    store.close();
    TestBed.inject(ResumeCache).write(lanternKeepPayload({ cleared: ['village'] }));
    let resolve!: (p: ReturnType<typeof lanternKeepPayload>) => void;
    api.getRun.mockReturnValue(new Promise((r) => (resolve = r)));
    const fixture = TestBed.createComponent(RunPage);
    fixture.componentRef.setInput('runId', RUN_ID);
    await fixture.whenStable();
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
    resolve(lanternKeepPayload({ cleared: ['village', 'marsh'] }));
    await fixture.whenStable();
    await vi.waitFor(() => expect(store.view()?.current).toBe('keep-gate'));
    store.setTaskState('marsh-herbs', 'done');
    await fixture.whenStable();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('renders no section list while there is no view', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { store, api } = await setupRunStore();
    store.close();
    TestBed.inject(ResumeCache).clear();
    api.getRun.mockReturnValue(new Promise(() => undefined));
    const fixture = TestBed.createComponent(RunPage);
    fixture.componentRef.setInput('runId', RUN_ID);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-section-list')).toBeNull();
    expect(el.textContent).toContain('Loading run');
  });

  it('gives leaf cards the heading level below their group', async () => {
    const { el } = await renderPage({ cleared: ['village'] });
    const card = el.querySelector('#section-marsh')!;
    expect(card.querySelector('[role="heading"]')?.getAttribute('aria-level')).toBe('3');
  });

  it('collapses a fully cleared group by default', async () => {
    const { el } = await renderPage({ cleared: ['village', 'marsh'] });
    expect(el.querySelector('#section-village')).toBeNull();
    expect(el.querySelector('#section-act-1')).not.toBeNull();
  });

  it('clears with an Undo toast', async () => {
    const { el, fixture, store } = await renderPage({ cleared: ['village', 'marsh'] });
    const page = fixture.componentInstance;
    page.requestClear('keep-gate');
    await fixture.whenStable();
    expect(store.view()?.current).toBe('east-tower');
    const toast = TestBed.inject(Toasts).toasts()[0]!;
    expect(toast.message).toBe('Cleared Keep Gate.');
    TestBed.inject(Toasts).runAction(toast.id);
    await fixture.whenStable();
    expect(store.view()?.current).toBe('keep-gate');
    expect(el.querySelector('#section-keep-gate')?.getAttribute('data-state')).toBe('current');
  });
});

describe('RunPage header (Route UI)', () => {
  it('uses the Route header styling and labels', async () => {
    const { el } = await renderPage();
    const header = el.querySelector('header')!;
    expect(header.classList.contains('border-rule')).toBe(true);
    expect(header.classList.contains('h-14')).toBe(true);
    expect(el.querySelector('h1')?.classList.contains('font-display')).toBe(true);
    expect(header.querySelector('a[aria-label="All runs"]')).not.toBeNull();
    expect(header.querySelector('button[aria-label="Run menu"]')).not.toBeNull();
  });

  it('shows "<guide title> · n of m cleared" when the guide title differs from the run name', async () => {
    const { el } = await renderPage({ cleared: ['village'] });
    expect(el.querySelector('[data-testid="run-subtitle"]')?.textContent?.trim()).toBe(
      'Completionist checklist · 1 of 7 cleared',
    );
  });

  it('shows just "n of m cleared" when the guide title equals the run name', async () => {
    const { store, api } = await setupRunStore();
    store.close();
    api.getRun.mockResolvedValue(
      lanternKeepPayload({ cleared: ['village'] }, 'Completionist checklist'),
    );
    const fixture = TestBed.createComponent(RunPage);
    fixture.componentRef.setInput('runId', RUN_ID);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="run-subtitle"]')?.textContent?.trim()).toBe(
      '1 of 7 cleared',
    );
  });
});

describe('RunPage clear and pin (§5.4)', () => {
  const dialog = (el: HTMLElement): HTMLDialogElement | null => el.querySelector('dialog[open]');
  const click = (root: Element, name: string): void =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!.click();

  it('clears at once when the leaf is unlocked and nothing closes', async () => {
    const { el, fixture, store } = await renderPage({ cleared: ['village', 'marsh'] });
    fixture.componentInstance.requestClear('keep-gate');
    await fixture.whenStable();
    expect(dialog(el)).toBeNull();
    expect(store.view()?.sections.get('keep-gate')?.cleared).toBe(true);
  });

  it('asks first when something closes, then clears with Undo', async () => {
    const { el, fixture, store } = await renderPage();
    fixture.componentInstance.requestClear('village');
    await fixture.whenStable();
    const d = dialog(el)!;
    const title = el.querySelector(`#${d.getAttribute('aria-labelledby')}`)!;
    expect(title.textContent?.trim()).toBe('Leave Harrow Village behind?');
    expect(title.classList.contains('text-lamp')).toBe(true);
    expect(store.view()?.sections.get('village')?.cleared).toBe(false);
    click(dialog(el)!, 'Clear anyway');
    await fixture.whenStable();
    expect(store.view()?.current).toBe('marsh');
    expect(dialog(el)).toBeNull();
    const toasts = TestBed.inject(Toasts);
    toasts.runAction(toasts.toasts()[0]!.id);
    expect(store.view()?.current).toBe('village');
  });

  it('closes the sheet and shows Undo outside it', async () => {
    const { el, fixture } = await renderPage();
    const stack = TestBed.inject(SheetStack);
    fixture.componentInstance.requestClear('village');
    await fixture.whenStable();
    expect(stack.isEmpty()).toBe(false);
    click(dialog(el)!, 'Clear anyway');
    await fixture.whenStable();
    expect(stack.isEmpty()).toBe(true);
    expect(TestBed.inject(Toasts).toasts()[0]?.action?.label).toBe('Undo');
  });

  it('undo restores the previous pin when the clear removed it', async () => {
    const { fixture, store } = await renderPage({
      cleared: ['village', 'marsh', 'keep-gate'],
      pin: 'east-tower',
    });
    fixture.componentInstance.requestClear('east-tower');
    await fixture.whenStable();
    expect(store.view()?.pinned).toBe(false);
    const toasts = TestBed.inject(Toasts);
    toasts.runAction(toasts.toasts()[0]!.id);
    expect(store.view()?.current).toBe('east-tower');
    expect(store.view()?.pinned).toBe(true);
  });

  it('cancels without clearing', async () => {
    const { el, fixture, store } = await renderPage();
    fixture.componentInstance.requestClear('village');
    await fixture.whenStable();
    click(dialog(el)!, 'Stay here');
    await fixture.whenStable();
    expect(dialog(el)).toBeNull();
    expect(store.view()?.sections.get('village')?.cleared).toBe(false);
  });

  it('focuses Stay here when the Clear dialog opens', async () => {
    const { el, fixture } = await renderPage();
    fixture.componentInstance.requestClear('village');
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Stay here'));
    expect(dialog(el)?.contains(document.activeElement)).toBe(true);
  });

  it('asks before pinning a locked leaf, then shows it as current with a lock hint', async () => {
    const { el, fixture, store } = await renderPage();
    fixture.componentInstance.requestPin('marsh');
    await fixture.whenStable();
    expect(dialog(el)?.textContent).toContain('Whisper Marsh is locked (requires Harrow Village).');
    click(dialog(el)!, 'Pin anyway');
    await fixture.whenStable();
    expect(store.view()?.current).toBe('marsh');
    expect(el.querySelector('#section-marsh')?.textContent).toContain('Requires: Harrow Village');
  });

  it('pins an unlocked leaf at once', async () => {
    const { fixture, store } = await renderPage({ cleared: ['village', 'marsh', 'keep-gate'] });
    fixture.componentInstance.requestPin('west-tower');
    expect(store.view()?.current).toBe('west-tower');
    expect(store.view()?.pinned).toBe(true);
  });

  it('undo does not clobber a newer pin', async () => {
    const { fixture, store } = await renderPage({
      cleared: ['village', 'marsh', 'keep-gate'],
      pin: 'east-tower',
    });
    fixture.componentInstance.requestClear('east-tower');
    await fixture.whenStable();
    fixture.componentInstance.requestPin('west-tower');
    const toasts = TestBed.inject(Toasts);
    toasts.runAction(toasts.toasts()[0]!.id);
    expect(store.view()?.sections.get('east-tower')?.cleared).toBe(false);
    expect(store.view()?.current).toBe('west-tower');
    expect(store.view()?.pinned).toBe(true);
  });

  it('asks first when clearing a locked leaf with nothing closing', async () => {
    const { el, fixture, store } = await renderPage();
    fixture.componentInstance.requestClear('keep-gate');
    await fixture.whenStable();
    expect(dialog(el)?.textContent).toContain('Keep Gate is locked');
    expect(store.view()?.sections.get('keep-gate')?.cleared).toBe(false);
  });

  it('moves focus to the new current card header after an immediate clear', async () => {
    const { fixture } = await renderPage({ cleared: ['village', 'marsh'] });
    fixture.componentInstance.requestClear('keep-gate');
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('#section-east-tower button[aria-expanded]'),
      ),
    );
  });

  it('moves focus to the new current card header after Clear anyway', async () => {
    const { el, fixture } = await renderPage();
    fixture.componentInstance.requestClear('village');
    await fixture.whenStable();
    click(dialog(el)!, 'Clear anyway');
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        document.querySelector('#section-marsh button[aria-expanded]'),
      ),
    );
  });
});

describe('RunPage update guide (§5.8)', () => {
  it('opens the update sheet from the menu and closes it after an applied update', async () => {
    const { el, fixture, api, store } = await renderPage();
    const press = (root: Element, name: string): void =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!.click();
    el.querySelector<HTMLButtonElement>('button[aria-label="Run menu"]')!.click();
    await fixture.whenStable();
    press(el, 'Update guide');
    await fixture.whenStable();
    const sheet = el.querySelector('app-update-guide-sheet');
    expect(sheet).not.toBeNull();
    const empty = { added: [], removed: [], edited: [], renamed: [] };
    api.dryRunUpdate.mockResolvedValue({
      issues: [],
      diff: {
        sections: empty,
        tasks: { ...empty, added: ['new-task'] },
        categories: empty,
        likelyRegenerated: false,
        progress: null,
        labels: {
          sections: {},
          tasks: { 'new-task': { title: 'New', spoiler: false } },
          categories: {},
        },
      },
    });
    api.applyUpdate.mockResolvedValue(lanternKeepPayload());
    const input = sheet!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'g.yaml')],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(api.dryRunUpdate).toHaveBeenCalledWith(RUN_ID, expect.any(File), 1),
    );
    await fixture.whenStable();
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    press(sheet!, 'Apply');
    await vi.waitFor(() => expect(el.querySelector('app-update-guide-sheet')).toBeNull());
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const current = store.view()!.current!;
    expect(
      (vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1) as HTMLElement).id,
    ).toBe(`section-${current}`);
  });

  describe('layouts', () => {
    function stubMedia(matches: boolean): void {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({
          matches,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      );
    }
    afterEach(() => vi.unstubAllGlobals());
    const title = (el: HTMLElement): string | undefined =>
      el.querySelector('[id^="detail-section-"] [role="heading"]')?.textContent?.trim();

    it('phone: no aside, list without detail pane, bar after main', async () => {
      stubMedia(false);
      const { el } = await renderPage({ cleared: ['village'] });
      expect(el.querySelector('aside')).toBeNull();
      const main = el.querySelector('main')!;
      expect(main.classList).not.toContain('max-w-[720px]');
      // The rows carry their own padding and the rail sits at 19px: the list is flush.
      expect(main.classList).not.toContain('px-3');
      expect(main.querySelector('app-bottom-bar')).toBeNull();
      expect(main.nextElementSibling?.tagName.toLowerCase()).toBe('app-bottom-bar');
      expect(el.querySelector('header app-bottom-bar')).toBeNull();
    });

    it('handheld: route aside, detail pane following current, selection and snap back', async () => {
      stubMedia(true);
      const { el, fixture, store } = await renderPage({ cleared: ['village'] });
      const aside = el.querySelector('aside[aria-label="Route"]')!;
      expect(aside.classList).toContain('w-[340px]');
      expect(el.querySelector('main')!.contains(aside)).toBe(true);
      expect(el.querySelector('header app-bottom-bar')).not.toBeNull();
      expect(title(el)).toContain('Marsh');
      const current = store.view()!.current!;
      expect(current).toBe('marsh');
      const row = aside.querySelector<HTMLButtonElement>('#section-village button')!;
      row.click();
      await fixture.whenStable();
      expect(title(el)).toContain('Harrow Village');
      store.setCleared('marsh', true);
      await fixture.whenStable();
      const next = store.view()!.current!;
      expect(next).not.toBe('village');
      expect(el.querySelector(`#detail-section-${next}`)).not.toBeNull();
    });

    it('handheld: clearing the selected non-current leaf snaps the pane to the new current', async () => {
      stubMedia(true);
      const { el, fixture, store } = await renderPage({ cleared: ['village'] });
      el.querySelector<HTMLButtonElement>('aside #section-keep-gate button')!.click();
      await fixture.whenStable();
      expect(title(el)).toContain('Keep Gate');
      fixture.componentInstance.requestClear('keep-gate');
      await fixture.whenStable();
      [...document.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent?.trim() === 'Clear anyway')
        ?.click();
      await fixture.whenStable();
      const next = store.view()!.current!;
      expect(store.view()!.sections.get('keep-gate')!.cleared).toBe(true);
      expect(el.querySelector(`#detail-section-${next}`)).not.toBeNull();
      expect(el.querySelector('#detail-section-keep-gate')).toBeNull();
    });

    it('handheld: the pane snaps back to current after a pin and after an unpin', async () => {
      stubMedia(true);
      const { el, fixture, store } = await renderPage();
      const select = async (id: string): Promise<void> => {
        el.querySelector<HTMLButtonElement>(`aside #section-${id} button`)!.click();
        await fixture.whenStable();
      };
      await select('keep-gate');
      expect(el.querySelector('#detail-section-keep-gate')).not.toBeNull();
      store.setPin('marsh');
      await fixture.whenStable();
      expect(store.view()!.current).toBe('marsh');
      expect(el.querySelector('#detail-section-marsh')).not.toBeNull();
      await select('keep-gate');
      expect(el.querySelector('#detail-section-keep-gate')).not.toBeNull();
      fixture.componentInstance.unpin();
      await fixture.whenStable();
      expect(store.view()!.current).toBe('village');
      expect(el.querySelector('#detail-section-village')).not.toBeNull();
    });

    it('handheld: the detail pane title is an h2', async () => {
      stubMedia(true);
      const { el } = await renderPage({ cleared: ['village'] });
      expect(
        el.querySelector('[id^="detail-section-"] [role="heading"][aria-level="2"]'),
      ).not.toBeNull();
    });

    it('handheld: keeps the selected leaf when a task on it changes and current stays put', async () => {
      stubMedia(true);
      const { el, fixture, store } = await renderPage({ cleared: ['village'] });
      el.querySelector<HTMLButtonElement>('aside #section-village button')!.click();
      await fixture.whenStable();
      store.setTaskState('lost-cat', 'done');
      await fixture.whenStable();
      expect(store.view()!.current).toBe('marsh');
      expect(title(el)).toContain('Harrow Village');
    });

    it('handheld: the route aside never scrolls sideways', async () => {
      stubMedia(true);
      const { el } = await renderPage();
      const aside = el.querySelector('aside[aria-label="Route"]')!;
      expect(aside.classList).toContain('overflow-y-auto');
      expect(aside.classList).toContain('overflow-x-hidden');
    });

    it('handheld: a guide update that removes the selected leaf falls back to current, no throw', async () => {
      stubMedia(true);
      const { el, fixture, store, api } = await renderPage({ cleared: ['village'] });
      el.querySelector<HTMLButtonElement>('aside #section-keep-gate button')!.click();
      await fixture.whenStable();
      expect(title(el)).toContain('Keep Gate');
      const payload = lanternKeepPayload({ cleared: ['village'] });
      const act2 = payload.guide.sections.find((s) => s.id === 'act-2')!;
      const without = {
        ...payload.guide,
        sections: payload.guide.sections.map((s) =>
          s.id === 'act-2'
            ? { ...act2, children: act2.children.filter((c) => c.id !== 'keep-gate') }
            : s,
        ),
        tasks: payload.guide.tasks.filter((t) => !JSON.stringify(t).includes('keep-gate')),
      };
      api.getRun.mockResolvedValue({ ...payload, guide: without });
      await store.refetch();
      await fixture.whenStable();
      expect(store.index()?.sections.has('keep-gate')).toBe(false);
      expect(store.view()!.current).toBe('marsh');
      expect(el.querySelector('#detail-section-marsh')).not.toBeNull();
    });

    it('handheld: a layout jump to a leaf shows it in the detail pane', async () => {
      stubMedia(true);
      const { el, fixture } = await renderPage({ cleared: ['village'] });
      expect(title(el)).toContain('Marsh');
      fixture.debugElement.injector.get(RunLayout).jumpTo('keep-gate');
      await fixture.whenStable();
      expect(el.querySelector('#detail-section-keep-gate')).not.toBeNull();
    });

    it('binds section-list detailPane by layout', async () => {
      const detailPane = (fixture: { debugElement: DebugElement }): unknown =>
        fixture.debugElement.query(By.directive(SectionList)).componentInstance.detailPane();
      stubMedia(true);
      expect(detailPane((await renderPage()).fixture)).toBe(true);
      TestBed.resetTestingModule();
      stubMedia(false);
      expect(detailPane((await renderPage()).fixture)).toBe(false);
    });

    it('handheld: after a clear, focus lands on the new current route row, not a Clear button', async () => {
      stubMedia(true);
      const { el, fixture, store } = await renderPage({ cleared: ['village'] });
      document.body.append(el);
      fixture.componentInstance.requestClear('marsh');
      await fixture.whenStable();
      const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === 'Clear anyway',
      );
      confirm?.click();
      await fixture.whenStable();
      const next = store.view()!.current!;
      await vi.waitFor(() => {
        const active = document.activeElement as HTMLElement;
        expect(active).toBe(el.querySelector(`aside #section-${next} [role="heading"] button`));
      });
      expect((document.activeElement as HTMLElement).textContent).not.toContain('Clear');
      el.remove();
    });

    it('handheld: no duplicate ids', async () => {
      stubMedia(true);
      const { el } = await renderPage({ cleared: ['village'] });
      const ids = [...el.querySelectorAll('[id]')].map((n) => n.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      expect(el.querySelector('#detail-section-marsh')).not.toBeNull();
    });
  });
});
