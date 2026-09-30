import { TestBed } from '@angular/core/testing';
import { SheetStack } from '../../shared/sheet-stack';
import { Toasts } from '../../shared/toasts';
import { RUN_ID, lanternKeepPayload } from '../../../testing/lantern-keep';
import { ResumeCache } from '../../run/resume-cache';
import { setupRunStore } from '../../../testing/run-store-harness';
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
    expect(headings.some((h) => h?.startsWith('Act 1'))).toBe(true);
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
    expect(dialog(el)?.textContent).toContain('Clear Harrow Village?');
    expect(store.view()?.sections.get('village')?.cleared).toBe(false);
    click(dialog(el)!, 'Clear anyway');
    await fixture.whenStable();
    expect(store.view()?.current).toBe('marsh');
    expect(dialog(el)).toBeNull();
    const toasts = TestBed.inject(Toasts);
    toasts.runAction(toasts.toasts()[0]!.id);
    expect(store.view()?.current).toBe('village');
  });

  it('closes the sheet and empties the SheetStack before the Undo toast shows', async () => {
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
    click(dialog(el)!, 'Cancel');
    await fixture.whenStable();
    expect(dialog(el)).toBeNull();
    expect(store.view()?.sections.get('village')?.cleared).toBe(false);
  });

  it('focuses Cancel when the Clear dialog opens', async () => {
    const { el, fixture } = await renderPage();
    fixture.componentInstance.requestClear('village');
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Cancel'));
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
});
