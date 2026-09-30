import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { WriteQueue } from '../sync/write-queue';
import { RELOAD, UpdatePrompt } from './update-prompt';

function setup(
  isEnabled = true,
  queue: { size: number; flush: () => Promise<void> } | null = null,
) {
  const versionUpdates = new Subject<VersionEvent>();
  const unrecoverable = new Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>();
  const reload = vi.fn();
  const size = signal(queue?.size ?? 0);
  const flush = vi.fn(queue?.flush ?? (() => Promise.resolve()));
  const checkForUpdate = vi.fn().mockResolvedValue(false);
  TestBed.configureTestingModule({
    providers: [
      { provide: SwUpdate, useValue: { isEnabled, versionUpdates, unrecoverable, checkForUpdate } },
      { provide: RELOAD, useValue: reload },
      { provide: WriteQueue, useValue: { size, flush } },
    ],
  });
  const fixture = TestBed.createComponent(UpdatePrompt);
  const ready = (): void =>
    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'a' },
      latestVersion: { hash: 'b' },
    });
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    versionUpdates,
    unrecoverable,
    reload,
    flush,
    checkForUpdate,
    ready,
  };
}

describe('UpdatePrompt (§5.7 PWA)', () => {
  afterEach(() => vi.useRealTimers());

  it('offers a reload once a new version is ready', async () => {
    const { fixture, el, versionUpdates, reload, ready } = setup();
    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Reload to update');
    ready();
    await fixture.whenStable();
    el.querySelector('button')!.click();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('flushes the write queue before reloading', async () => {
    let release!: () => void;
    const { fixture, el, reload, flush, ready } = setup(true, {
      size: 0,
      flush: () => new Promise<void>((r) => (release = r)),
    });
    ready();
    await fixture.whenStable();
    el.querySelector('button')!.click();
    await Promise.resolve();
    expect(flush).toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('says pending writes are saved on this device, then reloads', async () => {
    const { fixture, el, reload, ready } = setup(true, { size: 2, flush: () => Promise.resolve() });
    ready();
    await fixture.whenStable();
    vi.useFakeTimers();
    el.querySelector('button')!.click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(el.textContent).toContain('saved on this device and will sync after the reload');
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not wait forever for a stuck flush', async () => {
    const { fixture, el, reload, ready } = setup(true, {
      size: 1,
      flush: () => new Promise<void>(() => undefined),
    });
    ready();
    await fixture.whenStable();
    vi.useFakeTimers();
    el.querySelector('button')!.click();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once on a double tap', async () => {
    const { fixture, el, reload, ready } = setup();
    ready();
    await fixture.whenStable();
    const button = el.querySelector('button')!;
    button.click();
    button.click();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('also asks for a reload after an unrecoverable state', async () => {
    const { fixture, el, unrecoverable } = setup();
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'gone' });
    await fixture.whenStable();
    expect(el.textContent).toContain('Sweep needs to reload to keep working.');
    expect(el.querySelector('button')).not.toBeNull();
  });

  it('checks for updates when the app becomes visible', () => {
    const { checkForUpdate } = setup();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(checkForUpdate).toHaveBeenCalled();
  });

  it('stays silent when the service worker is off', async () => {
    const { fixture, el, checkForUpdate } = setup(false);
    await fixture.whenStable();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(el.textContent?.trim()).toBe('');
    expect(checkForUpdate).not.toHaveBeenCalled();
  });
});
