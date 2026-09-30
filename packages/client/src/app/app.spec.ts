import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App shell', () => {
  it('hosts the router outlet and the toast region', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SwUpdate, useValue: { isEnabled: false } }],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('router-outlet')).not.toBeNull();
    expect(el.querySelectorAll('app-toast-host').length).toBe(1);
    expect(el.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });
});
