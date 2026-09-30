import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { DemoSignInResponseDto, DemoStatusDto } from '@sweep/core';
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

  /** Whether demo sign-in is offered. Any failure means no: the sign-in page must still work. */
  async demoStatus(): Promise<boolean> {
    try {
      const body = await apiCall(this.http.get<DemoStatusDto>('/api/demo'));
      return body.enabled === true;
    } catch {
      return false;
    }
  }

  async signInDemo(): Promise<SessionUser> {
    const body = await apiCall(this.http.post<DemoSignInResponseDto>('/api/demo/sign-in', {}));
    return pick(body.user);
  }

  async signOut(): Promise<void> {
    await apiCall(this.http.post<unknown>(`${AUTH}/sign-out`, {}));
  }
}
