import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmSheet } from './confirm-sheet';
import { Sheet } from './sheet';
import { ToastHost } from './toast-host';
import { Toasts } from './toasts';

@Component({
  imports: [Sheet, ConfirmSheet],
  template: `
    <app-sheet heading="NOW" [(open)]="open"><p>content</p></app-sheet>
    <app-confirm-sheet
      heading="Delete run?"
      message="Delete Run A?"
      confirmLabel="Delete"
      [(open)]="confirmOpen"
      (confirmed)="confirmed.set(true)"
    />
  `,
})
class Host {
  readonly open = signal(false);
  readonly confirmOpen = signal(false);
  readonly confirmed = signal(false);
}

describe('Sheet', () => {
  it('opens as a labelled dialog and closes from the close button', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    const heading = dialog.querySelector(`#${dialog.getAttribute('aria-labelledby')}`);
    expect(heading?.textContent).toBe('NOW');
    (dialog.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('syncs open back to false when the dialog closes natively (Escape)', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    // Escape makes the browser close the dialog and fire `close`; jsdom does not model Escape.
    dialog.dispatchEvent(new Event('close'));
    await fixture.whenStable();
    expect(fixture.componentInstance.open()).toBe(false);
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('opens with showModal (focus trap and focus move) where the browser supports it', async () => {
    // jsdom has no showModal, so focus movement itself is native behaviour we cannot observe here.
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModal,
    });
    try {
      const fixture = TestBed.createComponent(Host);
      fixture.componentInstance.open.set(true);
      await fixture.whenStable();
      expect(showModal).toHaveBeenCalledTimes(1);
    } finally {
      delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
    }
  });

  it('confirm sheet emits confirmed and closes', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.confirmOpen.set(true);
    await fixture.whenStable();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    buttons.find((b) => b.textContent?.trim() === 'Delete')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.confirmed()).toBe(true);
    expect(fixture.componentInstance.confirmOpen()).toBe(false);
  });
});

@Component({
  imports: [Sheet, ConfirmSheet, ToastHost],
  template: `
    <app-toast-host />
    <app-sheet heading="Menu" [(open)]="menuOpen"><p>menu</p></app-sheet>
    <app-confirm-sheet heading="Sure?" message="Sure?" confirmLabel="Yes" [(open)]="confirmOpen" />
  `,
})
class ToastHostFixture {
  readonly menuOpen = signal(false);
  readonly confirmOpen = signal(false);
}

describe('Sheet toasts', () => {
  it('moves toasts into the topmost open sheet and back to the root host', async () => {
    const fixture = TestBed.createComponent(ToastHostFixture);
    const root = fixture.nativeElement as HTMLElement;
    TestBed.inject(Toasts).show('Undo me', { durationMs: 60_000 });
    await fixture.whenStable();
    const dialogs = () => [...root.querySelectorAll('dialog')];
    const rootHost = () =>
      [...root.querySelectorAll('app-toast-host')].find((h) => !h.closest('dialog'));
    expect(rootHost()?.textContent).toContain('Undo me');

    fixture.componentInstance.menuOpen.set(true);
    await fixture.whenStable();
    expect(rootHost()?.textContent).not.toContain('Undo me');
    expect(dialogs()[0]?.querySelector('app-toast-host')?.textContent).toContain('Undo me');

    fixture.componentInstance.confirmOpen.set(true);
    await fixture.whenStable();
    expect(dialogs()[0]?.querySelector('app-toast-host')).toBeNull();
    expect(dialogs()[1]?.querySelector('app-toast-host')?.textContent).toContain('Undo me');

    fixture.componentInstance.confirmOpen.set(false);
    fixture.componentInstance.menuOpen.set(false);
    await fixture.whenStable();
    expect(dialogs().every((d) => d.querySelector('app-toast-host') === null)).toBe(true);
    expect(rootHost()?.textContent).toContain('Undo me');
  });
});
