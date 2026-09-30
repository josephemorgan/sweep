import { TestBed } from '@angular/core/testing';
import { ToastHost } from './toast-host';
import { Toasts } from './toasts';

describe('ToastHost', () => {
  it('renders toasts in a live region with action and dismiss buttons', async () => {
    const fixture = TestBed.createComponent(ToastHost);
    const toasts = TestBed.inject(Toasts);
    const run = vi.fn();
    toasts.show('Cleared', { action: { label: 'Undo', run }, durationMs: 60_000 });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const live = root.querySelector('[role="status"][aria-live="polite"]')!;
    expect(live.textContent).toContain('Cleared');
    const buttons = [...live.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Undo', '✕']);
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Dismiss');
    buttons[0]?.click();
    await fixture.whenStable();
    expect(run).toHaveBeenCalledTimes(1);
    expect(live.querySelectorAll('button')).toHaveLength(0);
  });

  it('dismisses from the dismiss button', async () => {
    const fixture = TestBed.createComponent(ToastHost);
    TestBed.inject(Toasts).show('Saved', { durationMs: 60_000 });
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.textContent).not.toContain('Saved');
  });

  it('pauses the countdown on hover and resumes on leave', async () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(ToastHost);
      const toasts = TestBed.inject(Toasts);
      toasts.show('Hold', { durationMs: 1000 });
      fixture.detectChanges();
      const toast = (fixture.nativeElement as HTMLElement).querySelector('p')!.parentElement!;
      toast.dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(5000);
      expect(toasts.toasts()).toHaveLength(1);
      toast.dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(1000);
      expect(toasts.toasts()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
