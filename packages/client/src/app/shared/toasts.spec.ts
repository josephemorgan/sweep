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
});
