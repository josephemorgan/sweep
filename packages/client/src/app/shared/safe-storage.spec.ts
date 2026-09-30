import { TestBed } from '@angular/core/testing';
import { SafeStorage } from './safe-storage';

describe('SafeStorage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('round-trips JSON', () => {
    const storage = TestBed.inject(SafeStorage);
    expect(storage.write('k', { a: 1 })).toBe(true);
    expect(storage.read('k')).toEqual({ a: 1 });
    storage.remove('k');
    expect(storage.read('k')).toBeNull();
  });

  it('never throws when storage is full or blocked (Review Focus 1)', () => {
    const storage = TestBed.inject(SafeStorage);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(storage.write('k', 'v')).toBe(false);
    expect(storage.read('k')).toBeNull();
    expect(() => storage.remove('k')).not.toThrow();
  });

  it('treats corrupt JSON as missing', () => {
    localStorage.setItem('k', '{nope');
    expect(TestBed.inject(SafeStorage).read('k')).toBeNull();
  });
});
