import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApi } from './auth-api';

const USER = { id: 'u1', email: 'a@b.test', name: 'a', emailVerified: false };

describe('AuthApi', () => {
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads the session user, or null when signed out', async () => {
    const signedIn = api.getSession();
    http.expectOne('/api/auth/get-session').flush({ session: { id: 's1' }, user: USER });
    await expect(signedIn).resolves.toEqual({ id: 'u1', email: 'a@b.test', name: 'a' });

    const signedOut = api.getSession();
    http.expectOne('/api/auth/get-session').flush(null);
    await expect(signedOut).resolves.toBeNull();
  });

  it('signs in with JSON credentials', async () => {
    const result = api.signIn('a@b.test', 'secret-password');
    const req = http.expectOne({ method: 'POST', url: '/api/auth/sign-in/email' });
    expect(req.request.body).toEqual({ email: 'a@b.test', password: 'secret-password' });
    req.flush({ redirect: false, token: 't', user: USER });
    await expect(result).resolves.toEqual({ id: 'u1', email: 'a@b.test', name: 'a' });
  });

  it("maps Better Auth's error body", async () => {
    const result = api.signIn('a@b.test', 'wrong');
    http
      .expectOne('/api/auth/sign-in/email')
      .flush(
        { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await expect(result).rejects.toMatchObject({ status: 401, code: 'INVALID_EMAIL_OR_PASSWORD' });
  });

  it('signs out with an empty JSON body', async () => {
    const result = api.signOut();
    const req = http.expectOne({ method: 'POST', url: '/api/auth/sign-out' });
    expect(req.request.body).toEqual({});
    req.flush({ success: true });
    await result;
  });
});
