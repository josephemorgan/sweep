import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Session } from './session';

export const signedInGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const user = await inject(Session).ensure();
  return user ? true : router.createUrlTree(['/sign-in'], { queryParams: { next: state.url } });
};

export const signedOutGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await inject(Session).ensure();
  return user ? router.createUrlTree(['/']) : true;
};
