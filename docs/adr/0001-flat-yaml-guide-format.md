---
status: accepted
date: 2026-09-28
---

# 0001. Flat YAML guide format

## Context

A guide relates tasks to several sections at once: a task opens in one section, closes in another and may be shown in a third. Most guides will be produced by an LLM converting an existing walkthrough, but some users will write them by hand and object to LLM authoring. Authors need editor help (autocomplete, inline errors).

## Decision

A guide is YAML with a `sections` tree and a **flat** `tasks` list. Tasks refer to sections by ID; they are never nested inside sections. A JSON Schema is generated from core's schema definition and committed to `schema/`.

## Consequences

- The relational data is expressed honestly: windows point at sections instead of nesting under one.
- Flat lists are easy for an LLM to generate, and easy to diff and cross-check.
- Editors apply the JSON Schema to `.yaml` files through `# yaml-language-server: $schema=…`.
- Cross-references need validation (`unknown-section`, `unknown-category`), which the validator provides.

Source: spec §3.1.
