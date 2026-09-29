# Example guides

Valid example guides, used as documentation and as CI fixtures (spec §8).

| File | What it demonstrates | Spec source |
|---|---|---|
| `lantern-keep.yaml` | The reference guide in YAML: the full feature set in one small game | §3.8a |
| `lantern-keep.md` | The same guide in the Markdown container; both containers must produce the same model | §3.8b |
| `botw-open-world.yaml` | Open world: sections gated by `requires`, and per-window `home` | §3.9.1 |
| `ff8-second-chance.yaml` | A missable task with a 2nd chance (a later window) | §3.9.2 |
| `ff6-exclusive-relic.yaml` | An exclusive group (one relic only) with `spoiler` | §3.9.3 |

The §3.9 samples are illustrative, not factual guides to those games.

Every `.yaml`/`.yml`/`.md` here except this README must pass `pnpm sweep validate`; `pnpm test` checks every example through `test/examples.test.ts` (no issues at all, and the Lantern Keep `.yaml`/`.md` pair gives the same model), and CI runs `pnpm test`. This directory is `.prettierignore`d, so files keep their exact bytes.
