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
  return { el, events, section, accessibleText };
}

describe('ClearDialog (§5.4)', () => {
  it('lists what closes for good and what closes until later', async () => {
    const { el, section, events } = await renderDialog('village');
    expect(el.textContent).toContain('Clearing Harrow Village closes 2 open tasks.');
    expect(section('Gone for good')).toContain('Pay the ferryman');
    expect(section('Closes until later')).toContain(
      "Find the elder's cat · 2nd chance at Epilogue",
    );
    const buttons = [...el.querySelectorAll('button')];
    buttons.find((b) => b.textContent?.trim() === 'Clear anyway')!.click();
    buttons.find((b) => b.textContent?.trim() === 'Cancel')!.click();
    expect(events).toEqual(['confirmed', 'cancelled']);
  });

  it('warns about a locked leaf without naming a hidden requirement (Review Focus 5)', async () => {
    const { accessibleText } = await renderDialog('epilogue');
    expect(accessibleText()).toContain(
      'Epilogue is locked (requires a hidden section). Clear anyway?',
    );
    expect(accessibleText()).not.toContain('Throne Room');
  });

  it('blurs a closing spoiler task', async () => {
    const { el, accessibleText } = await renderDialog('throne-room', {
      cleared: ['village', 'marsh', 'keep-gate', 'east-tower', 'west-tower'],
    });
    expect(accessibleText()).not.toContain("The keeper's lantern");
    expect(
      el.querySelector('button[aria-label="Hidden spoiler task. Tap to reveal."]'),
    ).not.toBeNull();
  });
});
