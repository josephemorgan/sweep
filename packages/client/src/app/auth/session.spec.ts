import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../api/api-error';
import { AuthApi, type SessionUser } from '../api/auth-api';
import { signedInGuard } from './guards';
import { LAST_USER_KEY, Session } from './session';
import { unauthorizedInterceptor } from './unauthorized.interceptor';

const ANA: SessionUser = { id: 'u1', email: 'ana@sweep.test', name: 'ana' };

describe('Session', () => {
  let auth: {
    getSession: ReturnType<typeof vi.fn>;
    signIn: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    auth = { getSession: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthApi, useValue: auth }],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  it('asks the server when no user is cached', async () => {
    auth.getSession.mockResolvedValue(ANA);
    await expect(TestBed.inject(Session).ensure()).resolves.toEqual(ANA);
    expect(JSON.parse(localStorage.getItem(LAST_USER_KEY)!)).toEqual(ANA);
  });

  it('resumes from the cached user at once and confirms in the background', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(ANA));
    let answer!: (u: SessionUser | null) => void;
    auth.getSession.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const session = TestBed.inject(Session);
    await expect(session.ensure()).resolves.toEqual(ANA);
    answer(ANA);
    await Promise.resolve();
    expect(session.user()).toEqual(ANA);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ends the session when the server no longer knows the cached user', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(ANA));
    auth.getSession.mockResolvedValue(null);
    const session = TestBed.inject(Session);
    await session.ensure();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/sign-in'));
    expect(session.user()).toBeNull();
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
  });

  it('a slow background check after a manual sign-out does not bring the user back', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(ANA));
    let answer!: (u: SessionUser | null) => void;
    auth.getSession.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    auth.signOut.mockResolvedValue(undefined);
    const session = TestBed.inject(Session);
    await session.ensure();
    await session.signOut();
    answer(ANA);
    await new Promise((r) => setTimeout(r, 0));
    expect(session.user()).toBeNull();
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a failing background check after a manual sign-out does not bring the user back', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(ANA));
    let fail!: (e: unknown) => void;
    auth.getSession.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    auth.signOut.mockResolvedValue(undefined);
    const session = TestBed.inject(Session);
    await session.ensure();
    await session.signOut();
    fail(new ApiError(0, 'network', 'offline'));
    await new Promise((r) => setTimeout(r, 0));
    expect(session.user()).toBeNull();
  });

  it('keeps the cached user while the server is unreachable (offline resume)', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(ANA));
    auth.getSession.mockRejectedValue(new ApiError(0, 'network', 'offline'));
    const session = TestBed.inject(Session);
    await session.ensure();
    await Promise.resolve();
    expect(session.user()).toEqual(ANA);
  });

  it('expired() routes to sign in with a link back', async () => {
    const session = TestBed.inject(Session);
    session.user.set(ANA);
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/runs/abc');
    session.expired();
    expect(session.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/sign-in?next=%2Fruns%2Fabc');
  });

  it('signs in and out', async () => {
    auth.signIn.mockResolvedValue(ANA);
    auth.signOut.mockResolvedValue(undefined);
    const session = TestBed.inject(Session);
    await session.signIn('ana@sweep.test', 'pw');
    expect(session.user()).toEqual(ANA);
    await session.signOut();
    expect(session.user()).toBeNull();
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
  });

  it.each([400, 401])(
    'signs out locally when the server answers %i (session already gone)',
    async (status) => {
      localStorage.setItem(LAST_USER_KEY, JSON.stringify(ANA));
      auth.signOut.mockRejectedValue(new ApiError(status, 'bad-request', 'No session.'));
      const session = TestBed.inject(Session);
      session.user.set(ANA);
      await expect(session.signOut()).resolves.toBeUndefined();
      expect(session.user()).toBeNull();
      expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
    },
  );

  it('stays signed in when sign-out gets a server error', async () => {
    auth.signOut.mockRejectedValue(new ApiError(503, 'unavailable', 'Try later.'));
    const session = TestBed.inject(Session);
    session.user.set(ANA);
    await expect(session.signOut()).rejects.toBeInstanceOf(ApiError);
    expect(session.user()).toEqual(ANA);
  });

  it('stays signed in when sign-out fails', async () => {
    auth.signOut.mockRejectedValue(new ApiError(0, 'network', 'offline'));
    const session = TestBed.inject(Session);
    session.user.set(ANA);
    await expect(session.signOut()).rejects.toBeInstanceOf(ApiError);
    expect(session.user()).toEqual(ANA);
  });

  it('signedInGuard redirects to sign in with next', async () => {
    auth.getSession.mockResolvedValue(null);
    const result = await TestBed.runInInjectionContext(() =>
      signedInGuard({} as ActivatedRouteSnapshot, { url: '/runs' } as RouterStateSnapshot),
    );
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/sign-in?next=%2Fruns');
  });
});

describe('unauthorizedInterceptor', () => {
  it('reports a 401 from the API, but not from /api/auth', async () => {
    const expired = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: Session, useValue: { expired } },
      ],
    });
    const http = TestBed.inject(HttpClient);
    const ctl = TestBed.inject(HttpTestingController);

    const runs = firstValueFrom(http.get('/api/runs')).catch(() => undefined);
    ctl.expectOne('/api/runs').flush({}, { status: 401, statusText: 'Unauthorized' });
    await runs;
    expect(expired).toHaveBeenCalledTimes(1);

    const signIn = firstValueFrom(http.post('/api/auth/sign-in/email', {})).catch(() => undefined);
    ctl.expectOne('/api/auth/sign-in/email').flush({}, { status: 401, statusText: 'Unauthorized' });
    await signIn;
    expect(expired).toHaveBeenCalledTimes(1);
  });
});
