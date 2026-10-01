import { TestBed } from '@angular/core/testing';
import { setupRunStore } from '../../testing/run-store-harness';
import { ClearDialog } from './clear-dialog';

async function renderDialog(leafId: string, progress = {}) {
  const { store } = await setupRunStore(progress);
  const fixture = TestBed.createComponent(ClearDialog);
  fixture.componentRef.setInput('leafId', leafId);
  fixture.componentRef.setInput('impact', store.impactOf(leafId)!);
  const events: string[] = [];
  fixture.componentInstance.confirmed.subscribe(() => events.push('confirmed'));
  fixture.componentInstance.cancelled.subscribe(() => events.push('cancelled'));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const rows = (): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('li')];
  const rowFor = (title: string): string =>
    rows()
      .find((r) => r.textContent?.includes(title))
      ?.textContent?.replace(/\s+/g, ' ')
      .trim() ?? '';
  const button = (name: string): HTMLButtonElement =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  // The accessible text: blurred spans are aria-hidden, so drop them.
  const accessibleText = (): string => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    return clone.textContent ?? '';
  };
  // Accessible names other than text: aria-label and title attributes.
  const attributeNames = (): string =>
    [...el.querySelectorAll('[aria-label],[title]')]
      .map((n) => `${n.getAttribute('aria-label') ?? ''} ${n.getAttribute('title') ?? ''}`)
      .join(' ');
  const flat = (): string => (el.textContent ?? '').replace(/\s+/g, ' ');
  return { el, events, rows, rowFor, button, accessibleText, attributeNames, flat };
}

describe('ClearDialog (§5.4)', () => {
  it('is a padded column below the sheet header', async () => {
    const { el } = await renderDialog('village');
    const root = el.firstElementChild!;
    for (const c of ['flex', 'flex-col', 'gap-3', 'px-5', 'pb-5']) {
      expect(root.classList.contains(c)).toBe(true);
    }
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('leads with the plural count, without the suffix when some tasks return', async () => {
    const { flat } = await renderDialog('village');
    expect(flat()).toContain('Clearing this section closes 2 open tasks.');
    expect(flat()).not.toContain('They have no second chance.');
  });

  it('says "1 open task" in the singular and adds the suffix when all are gone for good', async () => {
    const { flat } = await renderDialog('marsh', { cleared: ['village'] });
    expect(flat()).toContain(
      'Clearing this section closes 1 open task. They have no second chance.',
    );
  });

  it('lists each closing task with its category, home and outcome', async () => {
    const { rowFor, rows } = await renderDialog('village');
    expect(rows().length).toBe(2);
    expect(rowFor('Pay the ferryman')).toContain('Story · here');
    expect(rowFor('Pay the ferryman')).toContain('Gone for good');
    expect(rowFor("Find the elder's cat")).toContain('Side quests · here');
    expect(rowFor("Find the elder's cat")).toContain('2nd chance at Epilogue');
    expect(rowFor("Find the elder's cat")).not.toContain('Gone for good');
  });

  it('names the home leaf when the task lives elsewhere', async () => {
    const { rowFor } = await renderDialog('throne-room', {
      cleared: ['village', 'marsh', 'keep-gate', 'east-tower', 'west-tower'],
    });
    expect(rowFor('Sunblade')).toContain('Loot · West Tower');
    expect(rowFor('Sunblade')).not.toContain('here');
  });

  it('styles the row parts', async () => {
    const { el, rows } = await renderDialog('village');
    const dot = rows()[0]!.querySelector('[aria-hidden="true"].bg-last-chance')!;
    expect(dot.classList.contains('rounded-full')).toBe(true);
    expect(rows()[0]!.classList.contains('min-h-12')).toBe(true);
    expect(el.querySelector('.text-last-chance')?.textContent).toContain('Gone for good');
    expect(el.textContent).toContain('Everything else here stays open.');
  });

  it('confirms with Clear anyway and cancels with Stay here', async () => {
    const { button, events } = await renderDialog('village');
    button('Clear anyway').click();
    button('Stay here').click();
    expect(events).toEqual(['confirmed', 'cancelled']);
  });

  it('warns about a locked leaf without naming a hidden requirement (Review Focus 5)', async () => {
    const { accessibleText, attributeNames, el } = await renderDialog('epilogue');
    expect(accessibleText()).toContain(
      'Epilogue is locked (requires a hidden section). Clear anyway?',
    );
    expect(el.querySelector('.text-missed')).not.toBeNull();
    expect(accessibleText()).not.toContain('Throne Room');
    expect(attributeNames()).not.toContain('Throne Room');
  });

  it('shows no locked warning for an unlocked leaf', async () => {
    const { el, accessibleText } = await renderDialog('village');
    expect(accessibleText()).not.toContain('is locked');
    expect(el.querySelector('.text-missed')).toBeNull();
  });

  it('keeps a closing spoiler task out of the visible text and labels', async () => {
    const { el, accessibleText, attributeNames } = await renderDialog('throne-room', {
      cleared: ['village', 'marsh', 'keep-gate', 'east-tower', 'west-tower'],
    });
    expect(el.querySelector('ul .redaction')).not.toBeNull();
    expect(accessibleText()).not.toContain("The keeper's lantern");
    expect(attributeNames()).not.toContain("The keeper's lantern");
    expect(el.textContent).toContain("The keeper's lantern");
    expect(
      el.querySelector('button[aria-label="Hidden spoiler task. Tap to reveal."]'),
    ).not.toBeNull();
  });

  it('styles Clear anyway as primary, not danger', async () => {
    const { button } = await renderDialog('village');
    expect(button('Clear anyway').classList.contains('btn-primary')).toBe(true);
    expect(button('Clear anyway').classList.contains('btn-danger')).toBe(false);
    expect(button('Stay here').classList.contains('btn')).toBe(true);
  });

  it('puts the locked warning before the closing summary, spoiler-safe', async () => {
    // throne-room is a locked spoiler section (needs both towers) whose clear closes the armory pair.
    const { accessibleText, attributeNames } = await renderDialog('throne-room', {
      cleared: ['village', 'marsh', 'keep-gate'],
    });
    const text = accessibleText();
    const locked = text.indexOf(
      'A hidden section is locked (requires East Tower, West Tower). Clear anyway?',
    );
    const closes = text.indexOf('Clearing this section closes');
    expect(locked).toBeGreaterThanOrEqual(0);
    expect(closes).toBeGreaterThan(locked);
    expect(text).not.toContain('Throne Room');
    expect(attributeNames()).not.toContain('Throne Room');
  });
});
