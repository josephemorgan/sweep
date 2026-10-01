import { TestBed } from '@angular/core/testing';
import { ApiError } from '../api/api-error';
import { Toasts } from '../shared/toasts';
import { RUN_ID } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { ResumeCache } from './resume-cache';
import { RunActions } from './run-actions';
import { RunLayout } from './run-layout';
import { RunMenu } from './run-menu';

const text = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
/** A jump item's title without its "current" and lock decorations. */
const title = (el: Element): string =>
  text(el)
    .replace(/ current$/, '')
    .replace(/^🔒 /, '')
    .replace(/ locked$/, '');
const findButton = (root: Element, name: string): HTMLButtonElement =>
  [...root.querySelectorAll('button')].find((b) => text(b).includes(name))!;
const click = (root: Element, name: string): void => findButton(root, name).click();

async function renderMenu(progress = {}) {
  const harness = await setupRunStore(progress, [RunLayout, { provide: RunActions, useValue: {} }]);
  const fixture = TestBed.createComponent(RunMenu);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const openMenu = async (): Promise<Element> => {
    (el.querySelector('button[aria-label="Run menu"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    return el.querySelector('dialog[open]')!;
  };
  const openItem = async (item: string): Promise<Element> => {
    click(await openMenu(), item);
    await fixture.whenStable();
    return el.querySelector('dialog[open]')!;
  };
  return { ...harness, fixture, el, openMenu, openItem, layout: TestBed.inject(RunLayout) };
}

/** What a screen reader could read: aria-hidden subtrees removed, plus every aria-label and title. */
function accessibleText(root: Element): string {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  const attrs = [...clone.querySelectorAll('[aria-label],[title]')].map(
    (n) => `${n.getAttribute('aria-label') ?? ''} ${n.getAttribute('title') ?? ''}`,
  );
  return `${clone.textContent} ${attrs.join(' ')}`;
}

describe('RunMenu (§5.2 ☰ menu)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.querySelector('[data-test-route]')?.remove();
  });

  it('after a jump on handheld, focuses the route row heading button', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const host = document.createElement('div');
    host.dataset['testRoute'] = '';
    host.innerHTML =
      '<aside aria-label="Route"><section id="section-epilogue"><div role="heading"><button type="button">Epilogue</button></div></section></aside>';
    document.body.append(host);
    const { openItem, fixture } = await renderMenu();
    const sheet = await openItem('Jump to section');
    click(sheet, 'Epilogue');
    await fixture.whenStable();
    expect(document.activeElement).toBe(host.querySelector('button'));
  });

  it('jumps to a section and marks current', async () => {
    const { openItem, layout, fixture, el } = await renderMenu();
    const sheet = await openItem('Jump to section');
    expect(sheet.querySelector('[aria-current="location"]')?.textContent).toContain(
      'Harrow Village',
    );
    click(sheet, 'Epilogue');
    await fixture.whenStable();
    expect(layout.scrollRequest()?.id).toBe('epilogue');
    expect(el.querySelector('dialog[open]')).toBeNull();
  });

  it('lists sections in route order with groups included', async () => {
    const { openItem } = await renderMenu();
    const sheet = await openItem('Jump to section');
    const titles = [...sheet.querySelectorAll('li button')].map((b) => text(b));
    expect(
      titles.slice(0, 4).map((t) =>
        t
          .replace(/ current$/, '')
          .replace(/^🔒 /, '')
          .replace(/ locked$/, ''),
      ),
    ).toEqual(['Act 1', 'Harrow Village', 'Whisper Marsh', 'Act 2']);
  });

  it('renders the section tree as nested lists', async () => {
    const { openItem } = await renderMenu();
    const sheet = await openItem('Jump to section');
    const act1 = [...sheet.querySelectorAll('li')].find(
      (li) => title(li.querySelector(':scope > button')!) === 'Act 1',
    )!;
    const inner = [...act1.querySelectorAll(':scope > ul button')].map(title);
    expect(inner).toEqual(['Harrow Village', 'Whisper Marsh']);
  });

  it('marks a locked non-spoiler section as locked for everyone', async () => {
    const { openItem } = await renderMenu();
    const sheet = await openItem('Jump to section');
    const west = findButton(sheet, 'West Tower');
    expect(
      west.querySelector('[aria-hidden="true"] .border-dashed.border-rail-ring'),
    ).not.toBeNull();
    expect(west.querySelector('.sr-only')?.textContent).toBe('locked');
    expect(findButton(sheet, 'Harrow Village').querySelector('.sr-only')).toBeNull();
    expect(findButton(sheet, 'Harrow Village').querySelector('.border-dashed')).toBeNull();
  });

  it('marks the current section with the lamp node and the rest with rail nodes', async () => {
    const { openItem } = await renderMenu();
    const sheet = await openItem('Jump to section');
    const current = sheet.querySelector('[aria-current="location"]')!;
    expect(current.querySelector('.bg-lamp.rounded-full')).not.toBeNull();
    expect(sheet.querySelectorAll('.bg-lamp').length).toBe(1);
    expect(sheet.querySelector('.bg-rail-dot, .border-rail-ring')).not.toBeNull();
    expect(sheet.innerHTML).not.toContain('🔒');
  });

  it('styles the menu items as hairline-separated rows and Delete run as missed', async () => {
    const { openMenu } = await renderMenu();
    const menu = await openMenu();
    const del = findButton(menu, 'Delete run');
    expect(del.classList.contains('text-missed')).toBe(true);
    expect(del.classList.contains('menu-item')).toBe(true);
    expect(menu.querySelector('li.border-b.border-rule')).not.toBeNull();
  });

  it('confirms deletion with a danger button beside a plain cancel', async () => {
    const { openItem } = await renderMenu();
    const confirm = await openItem('Delete run');
    expect(findButton(confirm, 'Delete run').classList.contains('btn-danger')).toBe(true);
    expect(findButton(confirm, 'Cancel').classList.contains('btn')).toBe(true);
  });

  it('uses ck checkboxes for the category toggles', async () => {
    const { openItem } = await renderMenu();
    const sheet = await openItem('Categories');
    const boxes = sheet.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBeGreaterThan(0);
    boxes.forEach((b) => expect(b.classList.contains('ck')).toBe(true));
  });

  it('caps the indentation of deep sections', async () => {
    const { openItem } = await renderMenu();
    const sheet = await openItem('Jump to section');
    const pads = [...sheet.querySelectorAll('li button')].map((b) =>
      parseFloat((b as HTMLElement).style.paddingLeft),
    );
    expect(Math.max(...pads)).toBeLessThanOrEqual(3);
  });

  it('never exposes the title of a locked spoiler section (§5.6)', async () => {
    const { openItem } = await renderMenu();
    const sheet = await openItem('Jump to section');
    expect(findButton(sheet, 'Hidden section').querySelector('.sr-only')?.textContent).toBe(
      'Hidden section',
    );
    expect(accessibleText(sheet)).not.toContain('Throne Room');
    expect(accessibleText(sheet)).toContain('Hidden section');
  });

  it('expands collapsed ancestors when jumping into a group', async () => {
    const { openItem, layout, fixture } = await renderMenu({ cleared: ['village', 'marsh'] });
    expect(layout.isCollapsed('act-1')).toBe(true);
    const sheet = await openItem('Jump to section');
    click(sheet, 'Whisper Marsh');
    await fixture.whenStable();
    expect(layout.isCollapsed('act-1')).toBe(false);
    expect(layout.scrollRequest()?.id).toBe('marsh');
  });

  it('toggles tracked categories', async () => {
    const { openItem, queue } = await renderMenu();
    const sheet = await openItem('Categories');
    const lore = [...sheet.querySelectorAll('label')].find((l) => l.textContent?.includes('Lore'))!;
    expect(lore.textContent).toContain('Readable books. Off by default.');
    (lore.querySelector('input[role="switch"]') as HTMLInputElement).click();
    expect(queue.pending().at(-1)).toEqual({
      kind: 'category',
      runId: RUN_ID,
      categoryId: 'lore',
      tracked: true,
    });
  });

  describe('rename', () => {
    async function rename(value: string) {
      const ctx = await renderMenu();
      const sheet = await ctx.openItem('Rename run');
      const input = sheet.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('LK run');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      sheet.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await ctx.fixture.whenStable();
      return { ...ctx, sheet };
    }

    it('renames the run through the queue', async () => {
      const { fixture, store, queue } = await rename('Second try');
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(store.run()?.name).toBe('Second try');
      });
      expect(queue.pending().at(-1)).toEqual({
        kind: 'run-name',
        runId: RUN_ID,
        name: 'Second try',
      });
    });

    it('trims the name', async () => {
      const { fixture, queue } = await rename('  Padded  ');
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(queue.pending().at(-1)).toMatchObject({ kind: 'run-name', name: 'Padded' });
      });
    });

    it('rejects a blank name in the form without sending it', async () => {
      const { fixture, queue, sheet, el } = await rename('   ');
      await fixture.whenStable();
      expect(queue.pending()).toEqual([]);
      expect(sheet.textContent).toContain('Name the run.');
      expect(el.querySelector('dialog[open]')).toBe(sheet);
    });

    it('checks the length of the trimmed name', async () => {
      const { fixture, queue } = await rename(`  ${'x'.repeat(100)}  `);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(queue.pending().at(-1)).toMatchObject({ kind: 'run-name', name: 'x'.repeat(100) });
      });
    });

    it('rejects a name over 100 characters', async () => {
      const { fixture, queue, sheet } = await rename('x'.repeat(101));
      await fixture.whenStable();
      expect(queue.pending()).toEqual([]);
      expect(sheet.textContent).toContain('Use 100 characters or fewer.');
    });
  });

  it('deletes after a confirmation that repeats the run name', async () => {
    const { openItem, api, router, queue, store } = await renderMenu();
    api.deleteRun.mockResolvedValue(undefined);
    store.setPin('marsh');
    store.setCleared('village', true);
    const cache = TestBed.inject(ResumeCache);
    const forget = vi.spyOn(cache, 'forget');
    const discard = vi.spyOn(queue, 'discardRun');
    const sheet = await openItem('Delete run');
    expect(sheet.textContent).toContain('Delete “LK run”?');
    click(sheet, 'Delete run');
    await vi.waitFor(() => expect(router.navigateByUrl).toHaveBeenCalledWith('/runs'));
    expect(api.deleteRun).toHaveBeenCalledWith(RUN_ID);
    expect(discard).toHaveBeenCalledWith(RUN_ID);
    expect(forget).toHaveBeenCalledWith(RUN_ID);
    expect(cache.lastRunId()).toBeNull();
    // Only the write already in flight remains (its outcome is ignored).
    expect(queue.pending().length).toBeLessThanOrEqual(1);
  });

  describe('delete failures and races', () => {
    it('keeps the run when the server refuses the delete', async () => {
      const { openItem, api, router, queue, store } = await renderMenu();
      const cache = TestBed.inject(ResumeCache);
      const forget = vi.spyOn(cache, 'forget');
      const discard = vi.spyOn(queue, 'discardRun');
      const show = vi.spyOn(TestBed.inject(Toasts), 'show');
      api.deleteRun.mockRejectedValue(new Error('boom'));
      const sheet = await openItem('Delete run');
      click(sheet, 'Delete run');
      await vi.waitFor(() => expect(show).toHaveBeenCalled());
      expect(show.mock.calls[0]![0]).toContain("Couldn't delete the run.");
      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(discard).not.toHaveBeenCalled();
      expect(forget).not.toHaveBeenCalled();
      expect(store.run()?.name).toBe('LK run');
    });

    it('treats a 404 as already deleted', async () => {
      const { openItem, api, router, queue } = await renderMenu();
      const cache = TestBed.inject(ResumeCache);
      const forget = vi.spyOn(cache, 'forget');
      const discard = vi.spyOn(queue, 'discardRun');
      api.deleteRun.mockRejectedValue(new ApiError(404, 'not_found', 'gone'));
      click(await openItem('Delete run'), 'Delete run');
      await vi.waitFor(() => expect(router.navigateByUrl).toHaveBeenCalledWith('/runs'));
      expect(discard).toHaveBeenCalledWith(RUN_ID);
      expect(forget).toHaveBeenCalledWith(RUN_ID);
    });

    it('navigates before the store closes, and closes before forgetting', async () => {
      const { openItem, api, router, store } = await renderMenu();
      const cache = TestBed.inject(ResumeCache);
      const order: string[] = [];
      api.deleteRun.mockResolvedValue(undefined);
      router.navigateByUrl = vi.fn(async () => {
        order.push('navigate');
        return true;
      });
      vi.spyOn(store, 'close').mockImplementation(() => void order.push('close'));
      vi.spyOn(cache, 'forget').mockImplementation(() => void order.push('forget'));
      click(await openItem('Delete run'), 'Delete run');
      await vi.waitFor(() => expect(order).toEqual(['navigate', 'close', 'forget']));
    });

    it('sends one DELETE while the first is in flight', async () => {
      const { openItem, api, fixture } = await renderMenu();
      let finish!: () => void;
      api.deleteRun.mockReturnValue(new Promise<void>((r) => (finish = r)));
      const confirm = await openItem('Delete run');
      click(confirm, 'Delete run');
      await fixture.whenStable();
      expect(findButton(confirm, 'Delete run').disabled).toBe(true);
      click(confirm, 'Delete run');
      expect(api.deleteRun).toHaveBeenCalledTimes(1);
      finish();
      await fixture.whenStable();
    });
  });

  describe('Update guide entry point', () => {
    it('is enabled when the queue is empty and emits updateGuide', async () => {
      const { openMenu, fixture } = await renderMenu();
      const onUpdate = vi.fn();
      fixture.componentInstance.updateGuide.subscribe(onUpdate);
      const menu = await openMenu();
      const item = findButton(menu, 'Update guide');
      expect(item.disabled).toBe(false);
      item.click();
      expect(onUpdate).toHaveBeenCalled();
    });

    it('is disabled with a reason while changes are unsaved (§5.7)', async () => {
      const { openMenu, store, fixture } = await renderMenu();
      store.setPin('marsh');
      await fixture.whenStable();
      const item = findButton(await openMenu(), 'Update guide');
      expect(item.disabled).toBe(true);
      expect(text(item)).toContain('Waiting for unsaved changes to sync');
    });
  });
});
