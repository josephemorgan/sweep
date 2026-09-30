import { Service, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DEMO_USER_EMAIL } from '@sweep/core';
import { isRetryable, toApiError, type ApiError } from '../api/api-error';
import { AuthApi, type SessionUser } from '../api/auth-api';
import { Reveals } from '../run/reveals';
import { SafeStorage } from '../shared/safe-storage';
import { Toasts } from '../shared/toasts';

function isRejection(e: ApiError): boolean {
  return e.status >= 400 && e.status < 500 && !isRetryable(e);
}

export const LAST_USER_KEY = 'sweep.lastUser';

function isSessionUser(value: unknown): value is SessionUser {
  const u = value as Partial<SessionUser> | null;
  return typeof u?.id === 'string' && typeof u.email === 'string' && typeof u.name === 'string';
}

/**
 * Who is signed in. `undefined` until checked. On launch a cached user is trusted at once (instant
 * resume, offline included, spec §5.7) and confirmed with the server in the background. Sessions
 * slide on every API call, so a 401 means the session really ended.
 */
@Service()
export class Session {
  private readonly auth = inject(AuthApi);
  private readonly storage = inject(SafeStorage);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly reveals = inject(Reveals);

  /** Bumped by every sign-in/sign-out: a slower background check() from before must not win. */
  private epoch = 0;

  readonly user = signal<SessionUser | null | undefined>(undefined);

  readonly isDemo = computed(() => this.user()?.email === DEMO_USER_EMAIL);

  ensure(): Promise<SessionUser | null> {
    const known = this.user();
    if (known !== undefined) return Promise.resolve(known);
    const cached = this.storage.read<unknown>(LAST_USER_KEY);
    if (!isSessionUser(cached)) return this.check();
    this.user.set(cached);
    void this.check().then((confirmed) => {
      if (confirmed === null) this.expired();
    });
    return Promise.resolve(cached);
  }

  async signIn(email: string, password: string): Promise<void> {
    this.remember(await this.auth.signIn(email, password));
  }

  async signInDemo(): Promise<void> {
    this.remember(await this.auth.signInDemo());
  }

  async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
    } catch (err) {
      // A 4xx means the server has no such session (already ended, cookie gone): signed out
      // anyway. No answer or a 5xx: stay signed in, so the user can try again.
      if (!isRejection(toApiError(err))) throw err;
    }
    this.forget();
  }

  /** The server answered 401: the session is over. Route to sign in, remembering where we were. */
  expired(): void {
    if (this.user() === null) return;
    this.forget();
    this.toasts.show('Your session ended. Sign in again to keep going.', { key: 'session' });
    const here = this.router.url;
    const keep = here && here !== '/' && !here.startsWith('/sign-in');
    void this.router.navigateByUrl(keep ? `/sign-in?next=${encodeURIComponent(here)}` : '/sign-in');
  }

  private async check(): Promise<SessionUser | null> {
    const epoch = this.epoch;
    const superseded = (): boolean => this.epoch !== epoch;
    try {
      const user = await this.auth.getSession();
      if (superseded()) return this.user() ?? null;
      if (user) this.remember(user);
      else if (this.user() === undefined) this.forget();
      return user;
    } catch {
      if (superseded()) return this.user() ?? null;
      // No answer (offline) or a server error is not "signed out": keep a cached user (offline
      // resume). A real sign-out shows up as a 401 on the next API call.
      const cached = this.storage.read<unknown>(LAST_USER_KEY);
      if (isSessionUser(cached)) {
        this.user.set(cached);
        return cached;
      }
      this.user.set(null);
      return null;
    }
  }

  private remember(user: SessionUser): void {
    this.epoch += 1;
    this.user.set(user);
    this.storage.write(LAST_USER_KEY, user);
  }

  private forget(): void {
    this.epoch += 1;
    this.user.set(null);
    this.reveals.clear();
    this.storage.remove(LAST_USER_KEY);
  }
}
