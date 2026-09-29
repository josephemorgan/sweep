# Example guides

Valid example guides, used as documentation and as CI fixtures (spec §8). Session B adds:

- `lantern-keep.yaml` and `lantern-keep.md` (spec §3.8; both containers must produce the same model)
- the spec §3.9 samples: Breath of the Wild (open world, per-window `home`), Final Fantasy VIII (2nd chance), Final Fantasy VI (exclusive relic with `spoiler`)

Every file here must pass `pnpm sweep validate` with no errors, and CI will check it once the validator lands (session A). This directory is `.prettierignore`d, so files keep their exact bytes.
