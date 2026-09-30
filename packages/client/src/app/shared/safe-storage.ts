import { DOCUMENT, Service, inject } from '@angular/core';

/**
 * localStorage behind try/catch (spec §5.7). Any access can throw (private mode, blocked site data,
 * quota), so every method degrades to "nothing stored" instead.
 */
@Service()
export class SafeStorage {
  private readonly doc = inject(DOCUMENT);

  read<T>(key: string): T | null {
    try {
      const raw = this.storage()?.getItem(key);
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }

  write(key: string, value: unknown): boolean {
    try {
      const storage = this.storage();
      if (!storage) return false;
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    try {
      this.storage()?.removeItem(key);
    } catch {
      // Nothing to do: storage is unavailable.
    }
  }

  private storage(): Storage | null {
    return this.doc.defaultView?.localStorage ?? null;
  }
}
