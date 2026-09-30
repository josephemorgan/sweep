import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { ApiError } from '../../api/api-error';
import { Session } from '../../auth/session';
import { SignInPage } from './sign-in-page';

async function setup(signIn: ReturnType<typeof vi.fn>, next?: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: Session, useValue: { signIn } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap(next === undefined ? {} : { next }) },
        },
      },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(SignInPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const type = (label: string, value: string): void => {
    const input = [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(label))!
      .querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async (): Promise<void> => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };
  return { fixture, el, type, submit, navigate };
}

describe('SignInPage', () => {
  it('validates before calling the server', async () => {
    const signIn = vi.fn();
    const { el, submit } = await setup(signIn);
    await submit();
    expect(signIn).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Enter your email.');
  });

  it('signs in and navigates to next', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    const { type, submit, navigate } = await setup(signIn);
    type('Email', 'ana@sweep.test');
    type('Password', 'correct-password');
    await submit();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(signIn).toHaveBeenCalledWith('ana@sweep.test', 'correct-password');
  });

  it.each([
    ['/runs/abc', '/runs/abc'],
    ['//evil.test', '/'],
    ['https://evil.test', '/'],
  ])('sends next=%s to %s after signing in', async (next, expected) => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    const { type, submit, navigate } = await setup(signIn, next);
    type('Email', 'ana@sweep.test');
    type('Password', 'correct-password');
    await submit();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(expected));
  });

  it('ties validation messages to their inputs', async () => {
    const { el, submit } = await setup(vi.fn());
    await submit();
    const input = el.querySelector('input[type="email"]')!;
    const id = input.getAttribute('aria-describedby')!;
    expect(el.querySelector(`#${id}`)?.textContent).toContain('Enter your email.');
  });

  it('shows a clear message for wrong credentials', async () => {
    const signIn = vi.fn().mockRejectedValue(new ApiError(401, 'INVALID_EMAIL_OR_PASSWORD', 'x'));
    const { fixture, el, type, submit } = await setup(signIn);
    type('Email', 'ana@sweep.test');
    type('Password', 'wrong-password');
    await submit();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'Wrong email or password.',
      );
    });
  });

  it('uses the Route page title and primary button', async () => {
    const { el } = await setup(vi.fn());
    expect(el.querySelector('h1')!.classList).toContain('font-display');
    expect(el.querySelector('button[type="submit"]')!.classList).toContain('btn-primary');
  });
});
