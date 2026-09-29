# JSON Schema

`sweep-guide.v1.schema.json` will live here. Session A **generates** it from `@sweep/core`'s Zod schema definition with `pnpm schema`, and it is committed. Once it exists, CI fails if the committed file drifts from the generated output (spec §9).

Don't edit the JSON by hand. Change the schema definition in `packages/core` and regenerate.

Editors apply it to `.yaml` guides through a first-line comment:

    # yaml-language-server: $schema=../../schema/sweep-guide.v1.schema.json

The server will also serve it at `/schema/sweep-guide.v1.schema.json` (session C; spec §7), so a guide anywhere can point at a deployed instance.
