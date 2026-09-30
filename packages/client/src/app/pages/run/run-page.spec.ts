import { TestBed } from '@angular/core/testing';
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
