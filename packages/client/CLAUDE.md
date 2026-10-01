# @sweep/client

Angular 22.2 PWA: standalone components and signals, no NgModules, no SSR. Tailwind CSS 4. Spec §5.

## Commands

- `pnpm --filter @sweep/client start`: `ng serve` on :4200, proxying `/api` to :3000 (`proxy.conf.json`)
- `pnpm --filter @sweep/client test`: Vitest via `ng test --watch=false` (only `src/**/*.spec.ts`)
- `pnpm --filter @sweep/client typecheck`: `ngc` (templates too) + spec + e2e tsconfigs
- `pnpm e2e`: Playwright `e2e/**/*.e2e.ts`, projects `phone` and `handheld-4x3`. The `webServer` recreates the `sweep_e2e` database (`e2e/support/reset-db.mts`, same Postgres as `DATABASE_URL`; name override `SWEEP_E2E_DB`), builds the production client and serves it from the real server on :3100. Each Playwright worker gets its own user (worker fixture `workerUser` in `e2e/support/fixtures.ts`): `e2e-<project>-w<parallelIndex>@sweep.test`, `storageState` in `e2e/.auth/<project>-w<n>.json`. The fixture reuses the file when `GET /api/auth/get-session` (not rate-limited) returns that user, so restarted workers (after failures, CI retries) cost 0 auth POSTs; otherwise it seeds the user with the create-user script and signs in with ONE API POST. The server allows one guide at a time per user (429), so tests never share a user across concurrent workers and each creates its own runs. Auth budget: the auth limiter allows 10 non-GET requests per minute per IP (in memory, reset on server start). `workers` is capped at 2 in `playwright.config.ts`: worst case 2 projects x 2 workers = 4 sign-ins, plus 4 from the sign-in flow (2 attempts per project) = 8. Adding a project, a worker or another auth POST needs a new budget. Set `SWEEP_E2E_REUSE=1` to reuse a running e2e server (never in CI). With reuse the server keeps its in-memory rate limits (30 uploads per hour per user) and the database keeps its runs (the 50-run quota) across runs, so reset the database or restart the server when you hit them. The auth limiter is in memory too, and a run with fresh sessions uses up to 8 of its budget, so wait a minute between reused runs. Stay under the server's rate limits (auth above, uploads 30/hour per user); create runs with the `runs` fixture, and never sign out through the server in a test. Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if the bundled chromium won't launch.
- Angular CLI MCP server: `angular-cli` in the root `.mcp.json`

## Sweep rules

- Import only `@sweep/core` (main entry). **Never `@sweep/core/parse`**; lint fails if you do. Upload validation happens on the server.
- Wrap the core engine in `computed()` signals (spec §4.12).
- **No raw colors.** Use only the tokens in `src/styles/tokens.css` (`bg-surface`, `text-fg-muted`, `text-missed`, `rounded-panel` …). Tailwind's default palette is disabled on purpose.
- Phone portrait is primary (touch targets ≥ 44px). 4:3 landscape uses `(orientation: landscape) and (max-height: 800px)`. Never allow horizontal page scroll.
- Prose is Markdown → sanitized HTML via DOMPurify (spec §6.4). Never bind unsanitized HTML.
- The service worker caches the app shell only, never `/api/*` (`ngsw-config.json` has no `dataGroups`).

## How the client is built

- `RunStore` (`src/app/run/run-store.ts`) holds the open run's server payload. Everything shown is derived with `computed()` from "server progress + pending writes" (`applyToProgress` folded over `WriteQueue.pending`). Never keep a second copy of progress in a component.
- Every run mutation goes through `RunStore` → `WriteQueue` (`src/app/sync/`). The queue rules (keys, coalescing, backoff, 401/404/422 handling, persistence per user) are the "Retry queue semantics" section of `docs/superpowers/plans/2026-09-29-client.md`; the tests in `write-queue.spec.ts` are numbered by rule.
- Run-view components inject `RunStore` and the page-scoped `RunLayout` (expansion, scroll) and `RunActions` (clear/pin requests that need dialogs). They take IDs as inputs, not view objects.
- Spoilers: `taskBlurred`/`sectionBlurred`/`sectionLabel` (`src/app/run/spoiler.ts`) plus the session-only `Reveals`. Any text that can name a spoiler goes through them, including toasts and dialog copy.
- Test helpers live in `src/testing/` (spec-only): `setupRunStore()` gives a signed-in store with Lantern Keep open and a hand-answered `FakeSender`.

## Spec interpretations

Readings of the spec that the user accepted where it leaves room. Change them only with the user's approval.

- **Unpin (§5.4):** "Unpin" shows only when current comes from a pin; a derived current shows "I'm here".
- **Undo (§5.4):** Undo is offered after both the immediate clear and a clear confirmed in the dialog. Undo restores a pin the clear removed only if the pin is still unset.
- **Metric sheets (§4.9, §5.5):** a multi-window task groups under the home of its open window, otherwise its first window that isn't closed. The choice uses window statuses only (not done, not-chosen or dont-care), so rows never jump groups.
- **Diff preview (§5.8):** titles come from `GuideDiff.labels` (read with `Object.hasOwn`), and spoiler-flagged labels follow the §5.6 blur. Spoiler-flagged items that exist only in the new guide are blurred by default (they have no run state yet).
- **Retry queue (§5.7, "any other 4xx drops"):** a 401 pauses and keeps the queue on disk per user; a 404 drops every write for that run; a 422 or other 4xx drops that write, refetches and toasts.
- **Unsaved badge:** "n unsaved" shows when the queue is stalled or has been non-empty for at least 1 s, not on every in-flight write.
- **Coalescing:** a new write replaces the LAST queued entry with the same key unless it is in flight. Invariant: writes with different keys are independent absolute values on the server, so reordering across keys cannot change the final state (documented by a test in `write-queue.spec.ts`). If an endpoint ever makes a write depend on another key's state, coalescing must become order-preserving.
- **Spoiler blur:** a courtesy, not a security boundary. Blurred text stays in the DOM (aria-hidden, select-none), so Ctrl+F can find it.
- **Task row ⋯:** a disclosure (aria-expanded/aria-controls), not `role=menu`.

## Open items for the user

- **§11.3 Retroid viewport:** `handheld-4x3` (1024x768) is an assumed CSS viewport. Confirm the device's real CSS viewport and DPR, then adjust that project in `playwright.config.ts` and the `(max-height: 800px)` landscape query if needed.

---

You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is the default in Angular v22+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of pairing `input()` with `output()`
- Use `computed()` for derived state
- Use `linkedSignal()` for state derived from multiple reactive sources that must stay synchronized
- Prefer inline templates for small components
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable in Angular v22+ and provide signal-based state, type-safe field access, and schema-based validation
- When not using Signal Forms, prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- Do NOT import `CommonModule`, import only the directives and pipes the template uses, such as `AsyncPipe` or `DatePipe`
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Prefer the `@Service` decorator over `@Injectable({providedIn: 'root'})` for new singleton services (Angular v22+)
- Use the `inject()` function instead of constructor injection
