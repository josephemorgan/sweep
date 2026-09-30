import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WriteQueue } from '../sync/write-queue';
import { UnsavedBadge } from './unsaved-badge';

describe('UnsavedBadge', () => {
  it('shows the unsaved count only while writes are queued', async () => {
    const size = signal(2);
    TestBed.configureTestingModule({ providers: [{ provide: WriteQueue, useValue: { size } }] });
    const fixture = TestBed.createComponent(UnsavedBadge);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('2 unsaved');
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    size.set(0);
    await fixture.whenStable();
    expect(el.textContent).not.toContain('unsaved');
  });
});
