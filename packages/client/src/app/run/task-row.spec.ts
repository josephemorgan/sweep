import { TestBed } from '@angular/core/testing';
import { indexGuide, type TaskStatus } from '@sweep/core';
import { LANTERN_KEEP } from '../../testing/lantern-keep';
import { taskBadges } from './task-badges';
import { TaskRow } from './task-row';

const tasks = indexGuide(LANTERN_KEEP).tasks;
const OPEN: TaskStatus = { kind: 'open', window: 0, secondChance: false };

async function render(taskId: string, status: TaskStatus, extra: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(TaskRow);
  fixture.componentRef.setInput('task', tasks.get(taskId)!);
  fixture.componentRef.setInput('status', status);
  for (const [k, v] of Object.entries(extra)) fixture.componentRef.setInput(k, v);
  const emitted: unknown[] = [];
  fixture.componentInstance.stateChange.subscribe((s) => emitted.push(s));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    el,
    emitted,
    checkbox: el.querySelector('input[type="checkbox"]') as HTMLInputElement,
  };
}

describe('taskBadges (§5.2)', () => {
  it('names each badge', () => {
    expect(taskBadges(OPEN, true, true, null).map((b) => b.label)).toEqual([
      '2nd chance',
      'Last chance',
    ]);
    expect(taskBadges({ kind: 'missed', nextChance: null }, false, false, null)).toEqual([
      { label: 'Missed', tone: 'missed' },
    ]);
    expect(
      taskBadges({ kind: 'missed', nextChance: 'epilogue' }, false, false, 'Epilogue')[0]!.label,
    ).toBe('Missed · 2nd chance at Epilogue');
    expect(taskBadges({ kind: 'not-chosen' }, false, false, null)).toEqual([
      { label: 'Not chosen', tone: 'not-chosen' },
    ]);
  });
});

describe('TaskRow', () => {
  it('checks and unchecks', async () => {
    const { checkbox, emitted, fixture } = await render('ferry-passage', OPEN);
    expect(checkbox.getAttribute('aria-label')).toBe('Pay the ferryman');
    checkbox.click();
    fixture.componentRef.setInput('status', { kind: 'done' });
    await fixture.whenStable();
    expect(checkbox.checked).toBe(true);
    checkbox.click();
    expect(emitted).toEqual(['done', null]);
  });

  it('dims a not-chosen row and disables its checkbox', async () => {
    const { el, checkbox } = await render('moonshield', { kind: 'not-chosen' });
    expect(checkbox.disabled).toBe(true);
    expect(el.textContent).toContain('Not chosen');
  });

  it('dims a not-chosen row through the text-not-chosen token, not opacity', async () => {
    const { el } = await render('moonshield', { kind: 'not-chosen' });
    const title = [...el.querySelectorAll('span, button')].find(
      (n) => n.textContent?.trim() === 'Moonshield',
    )!;
    expect(title.classList.contains('text-not-chosen')).toBe(true);
    expect(el.querySelector('.opacity-60')).toBeNull();
    const badge = [...el.querySelectorAll('span')].find((n) => n.textContent === 'Not chosen')!;
    expect(badge.classList.contains('text-not-chosen')).toBe(true);
  });

  it('shows missed with its 2nd chance', async () => {
    const { el } = await render(
      'lost-cat',
      { kind: 'missed', nextChance: 'epilogue' },
      { nextChanceLabel: 'Epilogue' },
    );
    expect(el.textContent).toContain('Missed · 2nd chance at Epilogue');
  });

  it('blurs a spoiler task everywhere it is named (Review Focus 5)', async () => {
    const { el, checkbox, fixture } = await render('keepers-lantern', OPEN);
    const names = [...el.querySelectorAll('[aria-label]')]
      .map((n) => n.getAttribute('aria-label'))
      .join(' ');
    expect(names).not.toContain("keeper's lantern");
    expect(el.querySelector('[aria-describedby]')).toBeNull();
    expect(el.querySelector('.redaction')).not.toBeNull();
    expect(el.textContent).toContain('tap to reveal');
    expect(el.querySelector('.blur-md')).toBeNull();
    expect(checkbox.getAttribute('aria-label')).toBe('Hidden spoiler task');
    expect(el.querySelector('button[aria-label^="More actions"]')!.getAttribute('aria-label')).toBe(
      'More actions for hidden spoiler task',
    );
    (
      el.querySelector(
        'button[aria-label="Hidden spoiler task. Tap to reveal."]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(checkbox.getAttribute('aria-label')).toBe("The keeper's lantern");
    expect(el.querySelector('button[aria-label^="More actions"]')!.getAttribute('aria-label')).toBe(
      "More actions for The keeper's lantern",
    );
  });

  it('shows a done spoiler task in the clear', async () => {
    const { checkbox } = await render('keepers-lantern', { kind: 'done' });
    expect(checkbox.getAttribute('aria-label')).toBe("The keeper's lantern");
  });

  it('expands how inline from the title', async () => {
    const { el, fixture } = await render('village-chest', OPEN);
    const title = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Chest behind the mill'),
    )!;
    expect(title.getAttribute('aria-expanded')).toBe('false');
    title.click();
    await fixture.whenStable();
    expect(title.getAttribute('aria-expanded')).toBe('true');
    expect(el.textContent).toContain('Push the crate');
  });

  it("sets don't care and resets from the ⋯ menu", async () => {
    const { el, emitted, fixture } = await render('village-chest', OPEN);
    const more = el.querySelector(
      'button[aria-label="More actions for Chest behind the mill"]',
    ) as HTMLButtonElement;
    more.click();
    await fixture.whenStable();
    (el.querySelector('[data-actions] button') as HTMLButtonElement).click();
    more.click();
    await fixture.whenStable();
    ([...el.querySelectorAll('[data-actions] button')][1] as HTMLButtonElement).click();
    expect(emitted).toEqual(['dont-care', null]);
  });
});

describe('TaskRow fix round 1', () => {
  const trigger = (el: HTMLElement) =>
    el.querySelector('button[aria-label^="More actions"]') as HTMLButtonElement;
  const items = (el: HTMLElement) =>
    [...el.querySelectorAll('[data-actions] button')] as HTMLButtonElement[];

  it('uses a disclosure, not an ARIA menu', async () => {
    const { el, fixture } = await render('village-chest', OPEN);
    const more = trigger(el);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click();
    await fixture.whenStable();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('[role="menu"], [role="menuitem"]')).toBeNull();
    const list = el.querySelector(`#${more.getAttribute('aria-controls')}`)!;
    expect([...list.querySelectorAll('button')].map((b) => b.textContent!.trim())).toEqual([
      "Don't care",
      'Reset',
    ]);
    more.click();
    await fixture.whenStable();
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape from the trigger and keeps focus there', async () => {
    const { el, fixture } = await render('village-chest', OPEN);
    const more = trigger(el);
    more.click();
    await fixture.whenStable();
    more.focus();
    more.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
  });

  it('closes and refocuses the trigger after choosing', async () => {
    const { el, emitted, fixture } = await render('village-chest', OPEN);
    const more = trigger(el);
    more.click();
    await fixture.whenStable();
    items(el)[0]!.focus();
    items(el)[0]!.click();
    await fixture.whenStable();
    expect(emitted).toEqual(['dont-care']);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
  });

  it('closes when focus leaves the row or a pointer goes down outside', async () => {
    const { el, fixture } = await render('village-chest', OPEN);
    const more = trigger(el);
    more.click();
    await fixture.whenStable();
    items(el)[0]!.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }),
    );
    await fixture.whenStable();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click();
    await fixture.whenStable();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the menu open when focus moves within the wrapper', async () => {
    const { el, fixture } = await render('village-chest', OPEN);
    const more = trigger(el);
    more.click();
    await fixture.whenStable();
    items(el)[0]!.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: items(el)[1] }),
    );
    await fixture.whenStable();
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('focuses the revealed title after a keyboard reveal', async () => {
    const { el, fixture } = await render('keepers-lantern', OPEN);
    const reveal = el.querySelector(
      'button[aria-label="Hidden spoiler task. Tap to reveal."]',
    ) as HTMLButtonElement;
    reveal.focus();
    reveal.click();
    await fixture.whenStable();
    expect(document.activeElement).not.toBe(document.body);
    expect(el.contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.textContent).toContain("The keeper's lantern");
  });

  it('moves focus to the revealed title element after tapping the redaction', async () => {
    const { el, fixture } = await render('keepers-lantern', OPEN);
    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Hidden spoiler task. Tap to reveal."]',
    )!.click();
    await fixture.whenStable();
    const active = document.activeElement as HTMLElement;
    expect(el.contains(active)).toBe(true);
    expect(active.getAttribute('aria-label')).not.toBe('Hidden spoiler task. Tap to reveal.');
    expect(active.textContent?.trim()).toBe("The keeper's lantern");
    expect(active.closest('.min-w-0')).not.toBeNull();
  });

  it('points the title at the how region while it exists, with unique ids', async () => {
    const a = await render('village-chest', OPEN);
    const b = await render('lost-cat', OPEN);
    const titleA = a.el.querySelector('button[aria-expanded]') as HTMLButtonElement;
    const titleB = b.el.querySelector('button[aria-expanded]') as HTMLButtonElement;
    expect(titleA.hasAttribute('aria-controls')).toBe(false);
    titleA.click();
    titleB.click();
    await a.fixture.whenStable();
    await b.fixture.whenStable();
    const idA = titleA.getAttribute('aria-controls')!;
    const idB = titleB.getAttribute('aria-controls')!;
    expect(idA).not.toBe(idB);
    expect(a.el.querySelector(`#${idA}`)!.textContent).toContain('Push the crate');
    expect(b.el.querySelector(`#${idB}`)!.textContent).toContain('cat hides');
  });

  it('renders a task without how as plain text, not a button', async () => {
    const { el } = await render('ferry-passage', OPEN);
    expect(
      [...el.querySelectorAll('button')].some((b) => b.textContent?.includes('Pay the ferryman')),
    ).toBe(false);
    expect(el.textContent).toContain('Pay the ferryman');
  });

  it('resets a done row with null', async () => {
    const { el, emitted, fixture } = await render('village-chest', { kind: 'done' });
    trigger(el).click();
    await fixture.whenStable();
    items(el)[1]!.click();
    expect(emitted).toEqual([null]);
  });

  it('does not emit from a disabled not-chosen checkbox', async () => {
    const { checkbox, emitted } = await render('moonshield', { kind: 'not-chosen' });
    checkbox.click();
    expect(emitted).toEqual([]);
  });

  it('renders a spoiler-safe next-chance label in the Missed badge', async () => {
    const { el } = await render(
      'lost-cat',
      { kind: 'missed', nextChance: 'epilogue' },
      { nextChanceLabel: 'a hidden section' },
    );
    expect(el.textContent).toContain('Missed · 2nd chance at a hidden section');
    expect(el.textContent).not.toContain('epilogue');
  });

  it('never falls back to a raw section id', () => {
    expect(
      taskBadges({ kind: 'missed', nextChance: 'epilogue' }, false, false, null)[0]!.label,
    ).toBe('Missed · 2nd chance at later');
  });
});
