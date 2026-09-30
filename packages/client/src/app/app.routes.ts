import type { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './auth/guards';

export const routes: Routes = [
  {
    path: 'sign-in',
    title: 'Sign in · Sweep',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./pages/sign-in/sign-in-page').then((m) => m.SignInPage),
  },
  {
    path: '',
    canActivate: [signedInGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'runs' },
      {
        path: 'runs',
        title: 'Runs · Sweep',
        loadComponent: () => import('./pages/runs/runs-page').then((m) => m.RunsPage),
      },
      {
        path: 'runs/new',
        title: 'New run · Sweep',
        loadComponent: () => import('./pages/new-run/new-run-page').then((m) => m.NewRunPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
