import { TestBed } from '@angular/core/testing';
import type { Guide } from '@sweep/core';
import { LANTERN_KEEP, RUN_ID, lanternKeepPayload } from '../../testing/lantern-keep';
import { setupRunStore } from '../../testing/run-store-harness';
import { GroupHeading } from './group-heading';
import { RunLayout } from './run-layout';

/** Act 1 gets a walkthrough; Act 2 becomes a locked spoiler group with a walkthrough. */
function guideWithGroups(): Guide {
  const guide = structuredClone(LANTERN_KEEP);
  const [act1, act2] = guide.sections;
  act1!.walkthrough = 'Act one **notes**.';
  act2!.spoiler = true;
  act2!.requires = { all: ['marsh'] };
  act2!.walkthrough = 'Act two notes.';
  return guide;
}

async function renderGroup(groupId: string, progress = {}) {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  const harness = await setupRunStore(progress, [RunLayout]);
  harness.api.getRun.mockResolvedValue({
    ...lanternKeepPayload(progress),
    guide: guideWithGroups(),
  });
  await harness.store.open(RUN_ID);
  const fixture = TestBed.createComponent(GroupHeading);
  fixture.componentRef.setInput('groupId', groupId);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string | RegExp): HTMLButtonElement =>
    [...el.querySelectorAll('button')].find((b) =>
      typeof label === 'string'
        ? b.textContent?.trim() === label || b.getAttribute('aria-label') === label
        : label.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
    )!;
  return { ...harness, fixture, el, button };
}

describe('GroupHeading (§5.2)', () => {
  it('shows the title at the given level, with the cleared/total count and its context', async () => {
    const { el, fixture } = await renderGroup('act-1', { cleared: ['village'] });
    fixture.componentRef.setInput('level', 4);
    await fixture.whenStable();
    const heading = el.querySelector('[role="heading"]')!;
    expect(heading.getAttribute('aria-level')).toBe('4');
    expect(heading.textContent).toContain('Act 1');
    expect(el.textContent).toContain('1 of 2');
    expect(el.querySelector('.sr-only')?.textContent).toContain('leaves cleared');
  });

  it('toggles collapse and reflects it in aria-expanded', async () => {
    const { el, fixture, button } = await renderGroup('act-1');
    expect(button('Collapse Act 1').getAttribute('aria-expanded')).toBe('true');
    button('Collapse Act 1').click();
    await fixture.whenStable();
    const toggle = button('Expand Act 1');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(TestBed.inject(RunLayout).isCollapsed('act-1')).toBe(true);
    expect(el.textContent).toContain('▸');
  });

  it('opens the walkthrough in a sheet, labelled with the group', async () => {
    const { el, fixture, button } = await renderGroup('act-1');
    expect(el.querySelector('app-markdown-view')).toBeNull();
    button('Walkthrough for Act 1').click();
    await fixture.whenStable();
    expect(el.querySelector('app-markdown-view')?.textContent).toContain('Act one notes.');
    expect(el.querySelector('dialog')?.hasAttribute('open')).toBe(true);
  });

  it('redacts a locked spoiler group title and names it as hidden', async () => {
    const { el, button } = await renderGroup('act-2');
    const heading = el.querySelector('[role="heading"]')!;
    expect(heading.querySelector('.redaction')).not.toBeNull();
    expect(el.textContent).toContain('tap to reveal');
    expect(el.querySelectorAll('button button').length).toBe(0);
    expect(el.querySelector('app-spoiler-text button')?.getAttribute('aria-label')).toBe(
      'Hidden spoiler section. Tap to reveal.',
    );
    expect(button('Expand hidden section') ?? button('Collapse hidden section')).toBeDefined();
    expect(button('Walkthrough for a hidden section')).toBeDefined();
  });
});

describe('GroupHeading route styles (R3)', () => {
  it('renders a depth-1 heading as a muted 12px row with "n of m"', async () => {
    const { el, fixture } = await renderGroup('act-1', { cleared: ['village'] });
    fixture.componentRef.setInput('depth', 1);
    await fixture.whenStable();
    const heading = el.querySelector('[role="heading"]')!;
    expect(heading.className).toContain('text-xs');
    expect(heading.className).toContain('text-fg-muted');
    expect(el.textContent).toContain('1 of 2');
  });

  it('renders a deeper heading in the display font with the count', async () => {
    const { el, fixture } = await renderGroup('act-1');
    fixture.componentRef.setInput('depth', 2);
    await fixture.whenStable();
    expect(el.querySelector('[role="heading"]')!.className).toContain('font-display');
    expect(el.textContent).toContain('0 of 2');
  });

  it('keeps Walkthrough a separate sibling button, never nested', async () => {
    const { el, button } = await renderGroup('act-1');
    expect(el.querySelectorAll('button button').length).toBe(0);
    expect(button('Walkthrough for Act 1').className).toContain('text-accent');
  });

  it('keeps the count outside the toggle so its aria-label does not hide it', async () => {
    const { el } = await renderGroup('act-1', { cleared: ['village'] });
    const heading = el.querySelector('[role="heading"]')!;
    const toggle = heading.querySelector('button')!;
    expect(toggle.textContent).not.toContain(' of ');
    expect(heading.textContent).toContain('1 of 2');
    expect(heading.textContent).toContain('leaves cleared');
  });
});
