---
status: accepted
date: 2026-09-28
---

# 0007. Single-file guide container

## Context

Uploading from a phone and pasting LLM chat output both produce a single file. Long walkthrough prose is hard to read inside YAML indentation. Zip uploads and multi-file guides are a v1 non-goal, but may be wanted later.

## Decision

A guide is one file in one of two containers, and both produce the same normalized model:

- YAML (`.yaml`, `.yml`): everything inline; walkthroughs are YAML block scalars.
- Markdown (`.md`): YAML front matter between `---` lines holds everything except walkthroughs, and the body holds walkthroughs under `# <section-id>` headings.

The parser takes a virtual file map (`Record<path, string>`). The upload layer maps the uploaded file to `guide.yaml` or `guide.md` by extension, and the map must contain exactly one of `guide.yaml`, `guide.yml` or `guide.md`.

## Consequences

- `.md` keeps long walkthrough prose readable and out of YAML indentation.
- `.yaml` is recommended for hand authoring, because editors apply the JSON Schema to it; most editors don't apply schemas to front matter.
- Zip support can be added later by filling the map from an archive.
- The Markdown container brings its own rules and error codes (`md-front-matter`, `md-heading`, `md-unknown-section`, `md-duplicate-section`, `walkthrough-twice`).

Source: spec §3.2 "Why single-file, not zip", §3.6, §1 Non-goals.
