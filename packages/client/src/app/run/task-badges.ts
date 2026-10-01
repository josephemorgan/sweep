import type { TaskStatus } from '@sweep/core';

export type BadgeTone = 'neutral' | 'missed' | 'last-chance' | 'not-chosen';
export interface Badge {
  label: string;
  tone: BadgeTone;
}

export const BADGE_CLASS: Record<BadgeTone, string> = {
  neutral: 'text-xs text-fg-muted',
  missed: 'text-xs font-bold text-missed',
  'last-chance': 'text-xs font-bold text-last-chance',
  'not-chosen': 'text-xs text-not-chosen',
};

/** Task-row badges (§5.2). `nextChanceLabel` is already spoiler-safe (see `sectionLabel`). */
export function taskBadges(
  status: TaskStatus,
  secondChance: boolean,
  lastChance: boolean,
  nextChanceLabel: string | null,
): Badge[] {
  const badges: Badge[] = [];
  if (secondChance) badges.push({ label: '2nd chance', tone: 'neutral' });
  if (status.kind === 'missed') {
    const label =
      status.nextChance === null
        ? 'Missed'
        : `Missed · 2nd chance at ${nextChanceLabel ?? 'later'}`;
    badges.push({ label, tone: 'missed' });
  }
  if (lastChance) badges.push({ label: 'Last chance', tone: 'last-chance' });
  if (status.kind === 'not-chosen') badges.push({ label: 'Not chosen', tone: 'not-chosen' });
  if (status.kind === 'dont-care') badges.push({ label: "Don't care", tone: 'neutral' });
  return badges;
}
