---
sweep: 1
game: Lantern Keep
title: Completionist checklist

categories:
  story:
    name: Story
    about: Main-path steps.
  loot:
    name: Loot
    about: Chests, hidden items and rewards.
  quests:
    name: Side quests
    about: Optional quests given by villagers.
  lore:
    name: Lore
    about: Readable books. Off by default.
    tracked: false

sections:
  - id: act-1
    title: Act 1
    overview: Leave the village and cross the marsh.
    sections:
      - id: village
        title: Harrow Village
        overview: Stock up and find passage across the river.
      - id: marsh
        title: Whisper Marsh
        overview: Follow the lantern posts to the keep.
  - id: act-2
    title: Act 2
    overview: Explore the keep's towers in either order.
    sections:
      - id: keep-gate
        title: Keep Gate
        overview: Open the gate and enter the courtyard.
      - id: east-tower
        title: East Tower
        overview: Climb the library tower.
      - id: west-tower
        title: West Tower
        overview: Climb the armory tower.
        requires: [keep-gate]
      - id: throne-room
        title: Throne Room
        overview: Confront the keeper of the lantern.
        spoiler: true
        requires: [east-tower, west-tower]
  - id: epilogue
    title: Epilogue
    overview: Return to the village as a hero.

tasks:
  - id: ferry-passage
    title: Pay the ferryman
    category: story
    windows:
      - from: village
  - id: village-chest
    title: Chest behind the mill
    category: loot
    how: Push the crate at the back of the mill aside.
    windows:
      - from: village
        until: marsh
  - id: lost-cat
    title: Find the elder's cat
    category: quests
    how: The cat hides in the village well. Lower the bucket.
    windows:
      - from: village
      - from: epilogue
        until: end
  - id: marsh-herbs
    title: Marsh herb patch
    category: loot
    windows:
      - from: marsh
        until: end
  - id: keep-history
    title: "Book: A History of the Keep"
    category: lore
    windows:
      - from: act-2
        until: end
        home: east-tower
  - id: sunblade
    title: Sunblade
    category: loot
    exclusive: armory-reward
    how: Take it from the armory rack. The other item vanishes.
    windows:
      - from: west-tower
        until: throne-room
  - id: moonshield
    title: Moonshield
    category: loot
    exclusive: armory-reward
    how: Take it from the armory rack. The other item vanishes.
    windows:
      - from: west-tower
        until: throne-room
  - id: keepers-lantern
    title: The keeper's lantern
    category: loot
    spoiler: true
    how: After the fight, examine the throne.
    windows:
      - from: throne-room
---

# village

## Arrival
Talk to the elder, then buy a **lantern** from the shop.

## Leaving
You can row back from the marsh, but not once you reach the keep.

# marsh

Keep to the lit path. The herb patch is north of the second post.
