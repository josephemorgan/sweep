import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Session } from './session';

/** A 401 from the API (never from /api/auth itself) means the session ended. */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(Session);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        req.url.startsWith('/api/') &&
        !req.url.startsWith('/api/auth/')
      ) {
        session.expired();
      }
      return throwError(() => err);
    }),
  );
};
