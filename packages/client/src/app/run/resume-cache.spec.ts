import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { Session } from '../auth/session';
import { RUN_ID, TEST_USER, lanternKeepPayload } from '../../testing/lantern-keep';
import { ResumeCache, resumeKey } from './resume-cache';

describe('ResumeCache', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    TestBed.inject(Session).user.set(TEST_USER);
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the last opened run per user', () => {
    const cache = TestBed.inject(ResumeCache);
    expect(cache.write(lanternKeepPayload())).toBe(true);
    expect(cache.lastRunId()).toBe(RUN_ID);
    expect(cache.read(RUN_ID)?.run.name).toBe('LK run');
    expect(cache.read('another-run')).toBeNull();
    TestBed.inject(Session).user.set({ ...TEST_USER, id: 'u2' });
    expect(cache.lastRunId()).toBeNull();
  });

  it('falls back to the run ID alone when the payload does not fit (Review Focus 1)', () => {
    const cache = TestBed.inject(ResumeCache);
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (value.length > 200) throw new DOMException('full', 'QuotaExceededError');
      real.call(this, key, value);
    });
    expect(cache.write(lanternKeepPayload())).toBe(false);
    expect(cache.lastRunId()).toBe(RUN_ID);
    expect(cache.read(RUN_ID)).toBeNull();
    expect(localStorage.getItem(resumeKey(TEST_USER.id))).toContain(RUN_ID);
  });

  it('forgets only the named run', () => {
    const cache = TestBed.inject(ResumeCache);
    cache.write(lanternKeepPayload());
    cache.forget('other');
    expect(cache.lastRunId()).toBe(RUN_ID);
    cache.forget(RUN_ID);
    expect(cache.lastRunId()).toBeNull();
  });
});
