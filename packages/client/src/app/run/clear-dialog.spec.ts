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
  const section = (heading: string): string =>
    [...el.querySelectorAll('section')]
      .find((s) => s.querySelector('h3')?.textContent === heading)
      ?.textContent?.replace(/\s+/g, ' ') ?? '';
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
  return { el, events, section, accessibleText, attributeNames };
}

describe('ClearDialog (§5.4)', () => {
  it('lists what closes for good and what closes until later', async () => {
    const { el, section, events } = await renderDialog('village');
    expect(el.textContent).toContain('Clearing Harrow Village closes 2 open tasks.');
    expect(section('Gone for good')).toContain('Pay the ferryman');
    expect(section('Closes until later')).toContain(
      "Find the elder's cat · 2nd chance at Epilogue",
    );
    expect(section('Closes until later')).not.toContain('Pay the ferryman');
    expect(section('Gone for good')).not.toContain("Find the elder's cat");
    const buttons = [...el.querySelectorAll('button')];
    buttons.find((b) => b.textContent?.trim() === 'Clear anyway')!.click();
    buttons.find((b) => b.textContent?.trim() === 'Cancel')!.click();
    expect(events).toEqual(['confirmed', 'cancelled']);
  });

  it('warns about a locked leaf without naming a hidden requirement (Review Focus 5)', async () => {
    const { accessibleText, attributeNames } = await renderDialog('epilogue');
    expect(accessibleText()).toContain(
      'Epilogue is locked (requires a hidden section). Clear anyway?',
    );
    expect(accessibleText()).not.toContain('Throne Room');
    expect(attributeNames()).not.toContain('Throne Room');
  });

  it('blurs a closing spoiler task', async () => {
    const { el, accessibleText, attributeNames } = await renderDialog('throne-room', {
      cleared: ['village', 'marsh', 'keep-gate', 'east-tower', 'west-tower'],
    });
    expect(accessibleText()).not.toContain("The keeper's lantern");
    expect(attributeNames()).not.toContain("The keeper's lantern");
    expect(
      el.querySelector('button[aria-label="Hidden spoiler task. Tap to reveal."]'),
    ).not.toBeNull();
  });

  it('uses the danger style for Clear anyway', async () => {
    const { el } = await renderDialog('village');
    const clear = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Clear anyway',
    )!;
    expect(clear.classList.contains('btn-danger')).toBe(true);
    expect(clear.classList.contains('btn-primary')).toBe(false);
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
    const closes = text.indexOf('Clearing a hidden section closes');
    expect(locked).toBeGreaterThanOrEqual(0);
    expect(closes).toBeGreaterThan(locked);
    expect(text).not.toContain('Throne Room');
    expect(attributeNames()).not.toContain('Throne Room');
  });

  it('says "1 open task" in the singular', async () => {
    const { el } = await renderDialog('marsh', { cleared: ['village'] });
    expect(el.textContent).toContain('Clearing Whisper Marsh closes 1 open task.');
  });
});
