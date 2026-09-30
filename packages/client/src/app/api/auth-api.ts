import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { apiCall } from './api-call';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

interface UserBody {
  user: SessionUser;
}

const AUTH = '/api/auth';

function pick(user: SessionUser): SessionUser {
  return { id: user.id, email: user.email, name: user.name };
}

/** Better Auth's email and password endpoints (mounted by the server at /api/auth). */
@Service()
export class AuthApi {
  private readonly http = inject(HttpClient);

  async getSession(): Promise<SessionUser | null> {
    const body = await apiCall(this.http.get<UserBody | null>(`${AUTH}/get-session`));
    return body?.user ? pick(body.user) : null;
  }

  async signIn(email: string, password: string): Promise<SessionUser> {
    const body = await apiCall(
      this.http.post<UserBody>(`${AUTH}/sign-in/email`, { email, password }),
    );
    return pick(body.user);
  }

  async signOut(): Promise<void> {
    await apiCall(this.http.post<unknown>(`${AUTH}/sign-out`, {}));
  }
}
