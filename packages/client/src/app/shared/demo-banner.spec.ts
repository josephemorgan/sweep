import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Session } from '../auth/session';
import { DemoBanner } from './demo-banner';

function setup(isDemo: boolean): HTMLElement {
  TestBed.configureTestingModule({
    providers: [{ provide: Session, useValue: { isDemo: signal(isDemo) } }],
  });
  const fixture = TestBed.createComponent(DemoBanner);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('DemoBanner', () => {
  it('is hidden for a normal user', () => {
    expect(setup(false).querySelector('[role="status"]')).toBeNull();
  });

  it('is visible for the demo user', () => {
    expect(setup(true).querySelector('[role="status"]')?.textContent).toContain('Demo');
  });
});
