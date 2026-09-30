import { Component, computed, inject, signal } from '@angular/core';
import { FormField, FormRoot, email, form, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { toApiError } from '../../api/api-error';
import { Session } from '../../auth/session';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

@Component({
  selector: 'app-sign-in-page',
  imports: [FormField, FormRoot],
  template: `
    <main class="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <h1 class="m-0 font-display font-semibold text-[22px] leading-7">Sign in to Sweep</h1>
      <form [formRoot]="signInForm" class="flex flex-col gap-4">
        <label class="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            autocomplete="username"
            class="field"
            [formField]="signInForm.email"
            [attr.aria-describedby]="showEmailError() ? 'email-error' : null"
          />
        </label>
        @if (showEmailError()) {
          <p id="email-error" class="-mt-2 text-sm text-missed">
            {{ signInForm.email().errors()[0]?.message }}
          </p>
        }
        <label class="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            autocomplete="current-password"
            class="field"
            [formField]="signInForm.password"
            [attr.aria-describedby]="showPasswordError() ? 'password-error' : null"
          />
        </label>
        @if (showPasswordError()) {
          <p id="password-error" class="-mt-2 text-sm text-missed">
            {{ signInForm.password().errors()[0]?.message }}
          </p>
        }
        @if (error(); as message) {
          <p role="alert" class="m-0 text-sm text-missed">{{ message }}</p>
        }
        <button type="submit" class="btn-primary" [disabled]="busy()">Sign in</button>
      </form>
    </main>
  `,
})
export class SignInPage {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly model = signal({ email: '', password: '' });

  protected readonly signInForm = form(
    this.model,
    (p) => {
      required(p.email, { message: 'Enter your email.' });
      email(p.email, { message: 'Enter a valid email address.' });
      required(p.password, { message: 'Enter your password.' });
    },
    { submission: { action: async () => this.submit() } },
  );

  protected readonly showEmailError = computed(
    () => this.signInForm.email().touched() && this.signInForm.email().invalid(),
  );
  protected readonly showPasswordError = computed(
    () => this.signInForm.password().touched() && this.signInForm.password().invalid(),
  );

  private async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    const { email: address, password } = this.model();
    try {
      await this.session.signIn(address.trim(), password);
      await this.router.navigateByUrl(safeNext(this.route.snapshot.queryParamMap.get('next')));
    } catch (err) {
      const e = toApiError(err);
      this.error.set(
        e.status === 401
          ? 'Wrong email or password.'
          : e.status === 429
            ? 'Too many sign-in attempts. Wait a minute and try again.'
            : e.message,
      );
    } finally {
      this.busy.set(false);
    }
  }
}
