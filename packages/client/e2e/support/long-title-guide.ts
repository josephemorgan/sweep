/** Exactly 70 characters: wider than any route row at 340px, so it must truncate on one line. */
export const LONG_TITLE =
  'The Interminable Descent Through the Forgotten Catacombs of Old Harrowgate'.slice(0, 70);

/** A guide whose second leaf has a 70-character title; the first leaf is current. */
export function longTitleGuide(): string {
  return `sweep: 1
game: Long title
title: Long title
categories:
  loot:
    name: Loot
    about: Items.
sections:
  - id: start
    title: Start
    overview: Where it begins.
  - id: deep
    title: ${LONG_TITLE}
    overview: Far below.
tasks:
  - id: coin
    title: Coin
    category: loot
    windows:
      - from: start
`;
}
