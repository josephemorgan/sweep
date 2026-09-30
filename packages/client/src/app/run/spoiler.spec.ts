import { TestBed } from '@angular/core/testing';
import { deriveRun, emptyProgress, indexGuide, type TaskStatus } from '@sweep/core';
import { LANTERN_KEEP } from '../../testing/lantern-keep';
import { Reveals } from './reveals';
import {
  HIDDEN_SECTION,
  sectionBlurred,
  sectionLabel,
  sectionRevealKey,
  taskBlurred,
} from './spoiler';
import { SpoilerText } from './spoiler-text';

const index = indexGuide(LANTERN_KEEP);
const lantern = index.tasks.get('keepers-lantern')!;
const throne = index.sections.get('throne-room')!;
const open: TaskStatus = { kind: 'open', window: 0, secondChance: false };

describe('spoiler rules (§5.6)', () => {
  it('blurs a spoiler task until it is done or revealed', () => {
    expect(taskBlurred(lantern, open, false)).toBe(true);
    expect(taskBlurred(lantern, { kind: 'done' }, false)).toBe(false);
    expect(taskBlurred(lantern, open, true)).toBe(false);
    expect(taskBlurred(index.tasks.get('sunblade')!, open, false)).toBe(false);
  });

  it('blurs a spoiler section while it is not reached', () => {
    const locked = { state: 'locked', cleared: false, unlocked: false, reached: false } as const;
    expect(sectionBlurred(throne, locked, false)).toBe(true);
    expect(
      sectionBlurred(
        throne,
        { ...locked, state: 'available', unlocked: true, reached: true },
        false,
      ),
    ).toBe(false);
  });

  it('labels a hidden section without naming it (Review Focus 5)', () => {
    const view = deriveRun(LANTERN_KEEP, emptyProgress());
    const reveals = TestBed.inject(Reveals);
    expect(sectionLabel(index, view, reveals, 'throne-room')).toBe(HIDDEN_SECTION);
    reveals.reveal(sectionRevealKey('throne-room'));
    expect(sectionLabel(index, view, reveals, 'throne-room')).toBe('Throne Room');
  });

  it('SpoilerText hides the text from assistive tech and reveals it on tap', async () => {
    const fixture = TestBed.createComponent(SpoilerText);
    fixture.componentRef.setInput('text', 'Throne Room');
    fixture.componentRef.setInput('hidden', true);
    fixture.componentRef.setInput('revealKey', 'section:throne-room');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Hidden spoiler. Tap to reveal.');
    expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe('Throne Room');
    button.click();
    await fixture.whenStable();
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent?.trim()).toBe('Throne Room');
    expect(TestBed.inject(Reveals).has('section:throne-room')).toBe(true);
  });
});
