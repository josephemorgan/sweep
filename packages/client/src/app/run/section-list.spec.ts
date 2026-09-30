import { TestBed } from '@angular/core/testing';
import type { Guide } from '@sweep/core';
import { LANTERN_KEEP, RUN_ID, lanternKeepPayload } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { RunActions } from './run-actions';
import { RunLayout } from './run-layout';
import { SectionList } from './section-list';

async function renderList(progress = {}, detailPane = false, guide?: Guide) {
  const harness = await setupRunStore(progress, [
    RunLayout,
    {
      provide: RunActions,
      useValue: { requestClear: vi.fn(), requestPin: vi.fn(), unpin: vi.fn() },
    },
  ]);
  if (guide) {
    harness.api.getRun.mockResolvedValue({ ...lanternKeepPayload(progress), guide });
    await harness.store.open(RUN_ID);
  }
  const fixture = TestBed.createComponent(SectionList);
  fixture.componentRef.setInput('sections', harness.store.guide()!.sections);
  fixture.componentRef.setInput('depth', 0);
  fixture.componentRef.setInput('detailPane', detailPane);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const card = (id: string): HTMLElement => el.querySelector(`app-leaf-card #section-${id}`)!;
  return { ...harness, fixture, el, card };
}

const hintText = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('[data-hint]')].map((h) => h.textContent!.trim());

describe('SectionList (route rail)', () => {
  it('renders one rail line and depth-1 group headings as muted 12px rows', async () => {
    const { el } = await renderList();
    const rail = el.querySelector('div[aria-hidden="true"].bg-rail')!;
    expect(rail.className).toContain('absolute');
    expect(el.querySelectorAll('.bg-rail').length).toBe(1);
    expect(el.querySelectorAll('app-section-list').length).toBe(0);
    const heading = el.querySelector('app-group-heading [role="heading"]')!;
    expect(heading.className).toContain('text-xs');
    expect(heading.className).toContain('text-fg-muted');
    expect(el.textContent).toMatch(/\d+ of \d+/);
  });

  it('renders leaves in route order', async () => {
    const { el } = await renderList();
    const ids = [...el.querySelectorAll('app-leaf-card section')].map((s) => s.id);
    expect(ids).toEqual([
      'section-village',
      'section-marsh',
      'section-keep-gate',
      'section-east-tower',
      'section-west-tower',
      'section-throne-room',
      'section-epilogue',
    ]);
  });

  it('gives the leaf after current the Opens after hint', async () => {
    const { el } = await renderList();
    expect(hintText(el)).toEqual(['Opens after Harrow Village']);
    expect(el.querySelector('#section-marsh [data-hint]')).not.toBeNull();
    expect(el.querySelector('#section-village [data-hint]')).toBeNull();
  });

  it('moves the hint when current moves', async () => {
    const { el, store, fixture } = await renderList();
    store.setPin('marsh');
    await fixture.whenStable();
    expect(hintText(el)).toEqual(['Opens after Whisper Marsh']);
    expect(el.querySelector('#section-keep-gate [data-hint]')).not.toBeNull();
  });

  it('shows no hint when current is the last leaf', async () => {
    const { el, store, fixture } = await renderList({
      cleared: ['village', 'marsh', 'keep-gate', 'east-tower', 'west-tower', 'throne-room'],
    });
    expect(store.view()!.current).toBe('epilogue');
    await fixture.whenStable();
    expect(hintText(el)).toEqual([]);
  });

  it('hides the hint when the next leaf is inside a collapsed group', async () => {
    const { el, fixture } = await renderList();
    TestBed.inject(RunLayout).setCollapsed('act-1', true);
    await fixture.whenStable();
    expect(el.querySelector('#section-marsh')).toBeNull();
    expect(hintText(el)).toEqual([]);
  });

  it('with detailPane, renders no panel and highlights the current row', async () => {
    const { el, card } = await renderList({}, true);
    expect(el.querySelector('[id^="card-body-"]')).toBeNull();
    const current = card('village');
    expect(current.className).toContain('bg-surface-raised');
    expect(current.className).toContain('rounded-l-panel');
    expect(current.querySelector('.text-lamp.font-display')).not.toBeNull();
  });

  it('with detailPane, tapping a row selects it and emits selectLeaf', async () => {
    const { fixture, el, card } = await renderList({}, true);
    const emitted: string[] = [];
    fixture.componentInstance.selectLeaf.subscribe((id) => emitted.push(id));
    (card('marsh').querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(emitted).toEqual(['marsh']);
    expect(card('marsh').className).toContain('bg-surface-raised');
    expect(card('village').className).not.toContain('bg-surface-raised');
    expect(el.querySelector('[id^="card-body-"]')).toBeNull();
  });

  it('gives a depth-2 group heading the display font', async () => {
    const guide = structuredClone(LANTERN_KEEP);
    const act1 = guide.sections[0]!;
    const [village, marsh] = act1.children;
    act1.children = [
      village!,
      {
        ...marsh!,
        id: 'sub',
        title: 'Sub',
        requires: { all: [] },
        children: [marsh!],
      },
    ];
    const { el } = await renderList({}, false, guide);
    const headings = [...el.querySelectorAll('app-group-heading [role="heading"]')];
    const sub = headings.find((h) => h.textContent?.includes('Sub'))!;
    expect(sub.className).toContain('font-display');
    expect(sub.getAttribute('aria-level')).toBe('3');
  });

  it('shows no hint when the leaf after current is already cleared', async () => {
    const { el, store, fixture } = await renderList({ cleared: ['marsh'], pin: 'village' });
    expect(store.view()!.current).toBe('village');
    await fixture.whenStable();
    expect(hintText(el)).toEqual([]);
  });
});
