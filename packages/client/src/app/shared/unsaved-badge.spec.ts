import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WriteQueue } from '../sync/write-queue';
import { UNSAVED_DELAY_MS, UnsavedBadge } from './unsaved-badge';

function setup(): {
  el: HTMLElement;
  size: ReturnType<typeof signal<number>>;
  stalled: ReturnType<typeof signal<boolean>>;
  tick: (ms?: number) => Promise<void>;
} {
  const size = signal(0);
  const stalled = signal(false);
  TestBed.configureTestingModule({
    providers: [{ provide: WriteQueue, useValue: { size, stalled } }],
  });
  const fixture = TestBed.createComponent(UnsavedBadge);
  const tick = async (ms = 0): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { el: fixture.nativeElement as HTMLElement, size, stalled, tick };
}

describe('UnsavedBadge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps an empty live region in the DOM', async () => {
    const { el, tick } = setup();
    await tick();
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(el.textContent).not.toContain('unsaved');
  });

  it('never shows a write accepted within a second', async () => {
    const { el, size, tick } = setup();
    size.set(1);
    await tick(UNSAVED_DELAY_MS - 100);
    expect(el.textContent).not.toContain('unsaved');
    size.set(0);
    await tick(UNSAVED_DELAY_MS);
    expect(el.textContent).not.toContain('unsaved');
  });

  it('shows the count once the queue has been non-empty for a second, with a screen reader text', async () => {
    const { el, size, tick } = setup();
    size.set(1);
    await tick(UNSAVED_DELAY_MS + 10);
    expect(el.textContent).toContain('1 unsaved');
    expect(el.querySelector('.sr-only')?.textContent?.trim()).toBe('1 unsaved change');
    size.set(3);
    await tick();
    expect(el.querySelector('.sr-only')?.textContent?.trim()).toBe('3 unsaved changes');
  });

  it('shows at once when the queue is stalled', async () => {
    const { el, size, stalled, tick } = setup();
    size.set(2);
    stalled.set(true);
    await tick();
    expect(el.textContent).toContain('2 unsaved');
  });

  it('hides when the queue empties, and waits a full second again next time', async () => {
    const { el, size, tick } = setup();
    size.set(1);
    await tick(UNSAVED_DELAY_MS + 10);
    expect(el.textContent).toContain('unsaved');
    size.set(0);
    await tick();
    expect(el.textContent).not.toContain('unsaved');
    size.set(1);
    await tick(500);
    expect(el.textContent).not.toContain('unsaved');
  });

  it('is plain last-chance text, not a pill', async () => {
    const { el, size, stalled, tick } = setup();
    size.set(1);
    stalled.set(true);
    await tick();
    const badge = el.querySelector('.text-last-chance')!;
    expect(badge).not.toBeNull();
    expect(el.innerHTML).not.toContain('rounded-full');
  });
});
