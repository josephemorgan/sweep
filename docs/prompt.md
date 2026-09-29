Sweep

# About
Sweep is a game-agnostic guide/checklist renderer. It consumes a human-readable text file describing a game's required, optional and missable completion steps, and renders an interactive checklist for the logged-in user.

# Motivation
When I'm replaying a retro game like Final Fantasy 8, I find myself glued to some old guide. I know a bunch of things are easily missable, and I don't always have the time to wander aimlessly looking for the next step in the story.

Unfortunately, I've been noticing that those guides tend to actually detract from my enjoyment for the game. I find that I'm not as immersed.

Instead of a full guide, I want something that I can glance at when entering a new area/chapter of the story to quickly see if anything important is missable/what my direction should be. I should be able to quickly tell if anything that I care about is available in a section of the game that I'm entering. If it is, I should be able to click on it to see how it's obtained, or pull up a full walkthrough for the area if I want.

# Main Features
The following interactions should be supported

## Game-Agnostic design
The contents of any game's guide are stored in a plaintext file that the app can read. The file itself would define chapters, items, steps, walkthroughs, etc. Sweep should define a clear, simple format that users can follow to create a guide for a given game. The format should be simple enough that a human could write it by hand, but should allow for arbitrary complexity (yaml maybe? Still an open question).

The format will need to support the following features:

1) Multiple chapter/section definitions. These can be nestable, for example Disk 1 > Balamb Garden for ff8. Each should carry the following information at minimum:
    1) One-sentence overview text
    2) Sections that must be completed before this section can start. In a linear game, this would just be the section before the current section.
    3) A section walkthrough.
2) A list of "tasks". These will be the check boxes in each section. Each should carry the following information:
    1) Which section the task is normally doable in. (1..n)
    2) The earliest section that a task becomes doable. (1)
    2) Which sections a task is doable in as a later opportunity. (0..n). The idea here is that something may normally be task at a certain point in a game, but if missed, there may be a chance to do it a second time much later in the game. These will be identified in the UI.
    3) Additional categorization of the task. These categories are arbitrary, and will show up to users as sections under a chapter's card. For example, balamb garden may have tasks that are "Loot", "Missable", "Story" and "Set-Up". The semantics of each category are up to the guide author, but the idea would be that the user can look at "missables" (or any other category) if that's all they care about.
3) Task category metadata. The file should list each task category, with a description of what it is. In the UI, this will allow the user to toggle which types of task they care about tracking.

This is just a brainstorming rough sketch of what the format should support, don't interpret it as specific instructions.

## Home Screen
The main screen of the app should show a top-level collapsible card list. Everything above the user's current position in the game should be collapsed, and any sections that aren't reachable yet due to the section's availability definitions should be greyed out.

When a card is expanded, it should show a one-sentence overview of the section.

Beneath that should be multiple expandable sections

### Walkthrough
A full step by step walkthrough for the section.

### Tasks
Each task category should get its own collapsible section within the card. The section header should show an always visible count of tasks that have been marked done by the user (e.g. 7/14).

It should be possible for a user to mark a task "done" or "don't care".

## Bottom Bar
The app should have a bottom bar that makes relevant information immediately available. Specifically, they should be able to tell task status at a glance. The default view would show "open tasks this chapter/all open tasks/open tasks not available next chapter/open tasks not available at all after this chapter" (e.g. 3/12/2/1). By default, this should show all tasks, but should be switchable between different task categories.

# Attached Screenshots
The attached screenshots are from my coworker's FFVI guide, which I'm using as inspiration. I like the overall look and functionality.

# Your Job
Brainstorm with me to make the app design more concrete. Clarify any questions that you have, and challenge me on my assumptions and possible issues.

Once details have been confirmed, initialize this project according to modern best practices for AI development in whatever software stack we use. Try to get this part right, since it'll impact everything we do in the future.

# General Rules
Use subagent driven development. Take the role of an orchistrator, using opus and sonnet subagents to do mechanical work and report back, to keep your context usage trim.

For any large, self-isolated subtasks, suggest them as separate sessions.

Keep an eye out for good pausing points to run a compact, and let me know whenever they come up.

Pass these instructions along to any sub-sessions that you suggest.
