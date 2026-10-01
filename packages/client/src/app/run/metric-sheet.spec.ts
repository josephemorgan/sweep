import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { lanternKeepPayload } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { Sheet } from '../shared/sheet';
import { MetricSheet } from './metric-sheet';

async function renderSheet(metric: string, progress = {}) {
  const harness = await setupRunStore(progress);
  const fixture = TestBed.createComponent(MetricSheet);
  fixture.componentRef.setInput('metric', metric);
  await fixture.whenStable();
  return { ...harness, fixture, el: fixture.nativeElement as HTMLElement };
}

@Component({
  selector: 'app-host',
  imports: [Sheet, MetricSheet],
  template: `<app-sheet heading="NOW" [open]="true"><app-metric-sheet metric="now" /></app-sheet>`,
})
class Host {}

describe('MetricSheet (§5.5)', () => {
  it('describes CLOSING against the current section and lists its tasks', async () => {
    const { el } = await renderSheet('closing');
    expect(el.textContent).toContain('Tasks that become missed if you clear Harrow Village.');
    expect(el.querySelector('input[aria-label="Pay the ferryman"]')).not.toBeNull();
    expect(el.querySelector('input[aria-label="Find the elder\'s cat"]')).not.toBeNull();
    expect(el.textContent).toContain('Last chance');
  });

  it('keeps a checked row in place until the sheet closes', async () => {
    const { el, fixture, store } = await renderSheet('now');
    (el.querySelector('input[aria-label="Pay the ferryman"]') as HTMLInputElement).click();
    await fixture.whenStable();
    expect(store.metrics()?.now).toBe(2);
    const box = el.querySelector('input[aria-label="Pay the ferryman"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
  });

  it('says so when a metric is empty', async () => {
    const { el } = await renderSheet('lastChance', { tasks: { 'ferry-passage': 'done' } });
    expect(el.textContent).toContain('Nothing here right now.');
  });

  it('drops rows whose task is gone when a new guide version arrives', async () => {
    const { el, fixture, store } = await renderSheet('now');
    expect(el.querySelector('input[aria-label="Pay the ferryman"]')).not.toBeNull();
    const payload = lanternKeepPayload();
    store.replacePayload({
      ...payload,
      guide: {
        ...payload.guide,
        tasks: payload.guide.tasks.filter((t) => t.id !== 'ferry-passage'),
      },
    });
    await fixture.whenStable();
    expect(el.querySelector('input[aria-label="Pay the ferryman"]')).toBeNull();
    expect(el.querySelector('input[aria-label="Chest behind the mill"]')).not.toBeNull();
  });

  it('never exposes a hidden spoiler title in accessible text, aria-label or title', async () => {
    const { el } = await renderSheet('now', {
      cleared: ['village', 'marsh', 'keep-gate', 'east-tower', 'west-tower'],
    });
    const clone = el.cloneNode(true) as HTMLElement;
    expect(clone.querySelector('input[aria-label="Hidden spoiler task"]')).not.toBeNull();
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    const secret = "The keeper's lantern";
    expect(clone.textContent).not.toContain(secret);
    for (const n of clone.querySelectorAll('[aria-label],[title]')) {
      expect(n.getAttribute('aria-label') ?? '').not.toContain(secret);
      expect(n.getAttribute('title') ?? '').not.toContain(secret);
    }
    expect(el.querySelector('.redaction')).not.toBeNull();
  });

  it('heads groups with a muted home label and separates rows with hairlines', async () => {
    const { el } = await renderSheet('now');
    const label = el.querySelector('h3')!;
    expect(label.classList.contains('text-fg-muted')).toBe(true);
    expect(label.classList.contains('text-xs')).toBe(true);
    expect(el.querySelector('li.border-b.border-rule')).not.toBeNull();
  });

  it('closes only the row menu on the first Escape, not the sheet', async () => {
    await setupRunStore();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const dialog = el.querySelector('dialog')!;
    const more = el.querySelector('button[aria-label^="More actions"]') as HTMLButtonElement;
    more.click();
    await fixture.whenStable();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const bubbled = vi.fn();
    dialog.addEventListener('keydown', bubbled);
    more.dispatchEvent(event);
    await fixture.whenStable();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(event.defaultPrevented).toBe(true);
    expect(bubbled).not.toHaveBeenCalled();
    // A second Escape (no menu open) is left alone for the dialog.
    const second = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    more.dispatchEvent(second);
    expect(second.defaultPrevented).toBe(false);
  });
});
