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
    (el.querySelector('[role="menuitem"]') as HTMLButtonElement).click();
    more.click();
    await fixture.whenStable();
    ([...el.querySelectorAll('[role="menuitem"]')][1] as HTMLButtonElement).click();
    expect(emitted).toEqual(['dont-care', null]);
  });
});
