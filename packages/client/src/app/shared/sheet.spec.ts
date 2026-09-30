import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmSheet } from './confirm-sheet';
import { Sheet } from './sheet';

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
