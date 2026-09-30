/** A 30-leaf guide: the 26th room sits below the fold at every viewport. */
export function longGuide(): string {
  const leaves = Array.from(
    { length: 30 },
    (_, i) => `      - id: leaf-${i + 1}
        title: Room ${i + 1}
        overview: Room number ${i + 1}.`,
  ).join('\n');
  return `sweep: 1
game: Long
title: Many rooms
categories:
  loot:
    name: Loot
    about: Items.
sections:
  - id: chapter
    title: Chapter One
    overview: All the rooms.
    walkthrough: |
      Start at the first room and keep going.
    sections:
${leaves}
tasks:
  - id: coin
    title: Coin
    category: loot
    windows:
      - from: leaf-30
`;
}
