import { TestBed } from '@angular/core/testing';
import { TOAST_MS, Toasts } from './toasts';

describe('Toasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a toast and removes it after TOAST_MS', () => {
    const toasts = TestBed.inject(Toasts);
    toasts.show('Saved');
    expect(toasts.toasts().map((t) => t.message)).toEqual(['Saved']);
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts.toasts()).toEqual([]);
  });

  it('runs an action once and dismisses the toast', () => {
    const toasts = TestBed.inject(Toasts);
    const run = vi.fn();
    const id = toasts.show('Cleared', { action: { label: 'Undo', run } });
    toasts.runAction(id);
    toasts.runAction(id);
    expect(run).toHaveBeenCalledTimes(1);
    expect(toasts.toasts()).toEqual([]);
  });

  it('replaces a toast with the same key', () => {
    const toasts = TestBed.inject(Toasts);
    toasts.show('one', { key: 'sync' });
    toasts.show('two', { key: 'sync' });
    toasts.show('other');
    expect(toasts.toasts().map((t) => t.message)).toEqual(['two', 'other']);
  });

  it('pauses the countdown while hovered or focused and resumes with the time left', () => {
    const toasts = TestBed.inject(Toasts);
    const id = toasts.show('Cleared');
    vi.advanceTimersByTime(TOAST_MS - 1000);
    toasts.pause(id);
    vi.advanceTimersByTime(TOAST_MS * 5);
    expect(toasts.toasts()).toHaveLength(1);
    toasts.resume(id);
    vi.advanceTimersByTime(999);
    expect(toasts.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts.toasts()).toEqual([]);
  });

  it('ignores pause and resume for unknown or already paused toasts', () => {
    const toasts = TestBed.inject(Toasts);
    toasts.pause(99);
    toasts.resume(99);
    const id = toasts.show('x');
    toasts.pause(id);
    toasts.pause(id);
    toasts.resume(id);
    toasts.resume(id);
    vi.advanceTimersByTime(TOAST_MS);
    expect(toasts.toasts()).toEqual([]);
  });
});
