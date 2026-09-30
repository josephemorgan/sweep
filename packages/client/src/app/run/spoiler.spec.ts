import { type ComponentFixture, TestBed } from '@angular/core/testing';
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

  function mount(inputs: Record<string, unknown>): ComponentFixture<SpoilerText> {
    const fixture = TestBed.createComponent(SpoilerText);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    return fixture;
  }

  it('SpoilerText renders plain text without a button when not hidden', async () => {
    const fixture = mount({ text: 'Plain', hidden: false, revealKey: 'k' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent?.trim()).toBe('Plain');
  });

  it('SpoilerText renders plain text for an item already revealed', async () => {
    TestBed.inject(Reveals).reveal('k2');
    const fixture = mount({ text: 'Seen', hidden: true, revealKey: 'k2' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent?.trim()).toBe('Seen');
  });

  it('SpoilerText uses a custom label as the aria-label', async () => {
    const fixture = mount({ text: 'X', hidden: true, revealKey: 'k3', label: 'Hidden task. Tap.' });
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Hidden task. Tap.');
  });

  it('SpoilerText tap does not reach a parent click handler', async () => {
    const fixture = mount({ text: 'X', hidden: true, revealKey: 'k4' });
    await fixture.whenStable();
    const parent = vi.fn();
    const el = fixture.nativeElement as HTMLElement;
    el.addEventListener('click', parent);
    el.querySelector('button')!.click();
    expect(parent).not.toHaveBeenCalled();
  });

  it('SpoilerText keeps focus on the revealed text, not the body', async () => {
    const fixture = mount({ text: 'Focus me', hidden: true, revealKey: 'k5' });
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    document.body.append(el);
    const button = el.querySelector('button')!;
    button.focus();
    button.click();
    await fixture.whenStable();
    expect(document.activeElement).not.toBe(document.body);
    expect(el.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent?.trim()).toBe('Focus me');
    el.remove();
  });

  it('SpoilerText blur is a courtesy: text stays out of the accessible name', async () => {
    const fixture = mount({ text: 'Secret', hidden: true, revealKey: 'k6' });
    await fixture.whenStable();
    const span = (fixture.nativeElement as HTMLElement).querySelector('span')!;
    expect(span.className).toContain('blur-md');
    expect(span.className).toContain('select-none');
  });
});

describe('sectionBlurred edge cases', () => {
  const locked = { state: 'locked', cleared: false, unlocked: false, reached: false } as const;
  it('is false once revealed', () => {
    expect(sectionBlurred({ spoiler: true }, locked, true)).toBe(false);
  });
  it('is false for a non-spoiler section', () => {
    expect(sectionBlurred({ spoiler: false }, locked, false)).toBe(false);
  });
  it('is blurred when the view is unknown', () => {
    expect(sectionBlurred({ spoiler: true }, undefined, false)).toBe(true);
  });
});
