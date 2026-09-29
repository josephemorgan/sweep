# Architecture decision records

Short, settled decisions. **Don't re-litigate an accepted ADR.** To change one, add a new ADR with `supersedes: NNNN`, set the old one's `status: superseded by NNNN`, and get the user's approval.

Format (MADR-lite): YAML front matter (`status`, `date`, optional `supersedes`), then `# NNNN. Title`, `## Context`, `## Decision`, `## Consequences`, and a `Source:` line citing the spec section.

| ADR | Decision |
|---|---|
| [0001](0001-flat-yaml-guide-format.md) | Guides are flat YAML: a section tree plus a flat task list |
| [0002](0002-section-tree-plus-requires-dag.md) | Containment is a tree; progression is a `requires` DAG |
| [0003](0003-missable-is-computed.md) | Missable is computed from windows, never authored |
| [0004](0004-event-based-window-closure.md) | A window closes when `until` is cleared, not by route position |
| [0005](0005-per-window-home.md) | Each window has a `home` leaf that shows its checkbox |
| [0006](0006-clear-plus-pin-position-model.md) | Explicit Clear with an impact warning, plus an optional pin |
| [0007](0007-single-file-container.md) | One file per guide: `.yaml` or `.md`; zip later via a virtual file map |
| [0008](0008-renamed-from-and-diff-preview.md) | `renamed_from` plus a diff preview keep progress across guide updates |
| [0009](0009-parser-as-separate-entry-point.md) | The parser is `@sweep/core/parse`, kept out of the client bundle |
| [0010](0010-angular-and-express.md) | Angular (client) and Express (server) |
| [0011](0011-no-ssr.md) | No server-side rendering |
| [0012](0012-private-guides-with-accounts.md) | Accounts; guides private to the uploader, never shared |
| [0013](0013-pnpm-10-pin.md) | Pin pnpm 10.34.6 (corepack < 0.34.5, Node < 24.12, can't run pnpm 12) |
| [0014](0014-core-consumed-as-built-output.md) | Consumers import core's built `dist/`, rebuilt on install |
