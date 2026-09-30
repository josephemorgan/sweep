# @sweep/client

Angular 22.2 PWA: standalone components and signals, no NgModules, no SSR. Tailwind CSS 4. Spec §5.

## Commands

- `pnpm --filter @sweep/client start`: `ng serve` on :4200, proxying `/api` to :3000 (`proxy.conf.json`)
- `pnpm --filter @sweep/client test`: Vitest via `ng test --watch=false` (only `src/**/*.spec.ts`)
- `pnpm --filter @sweep/client typecheck`: `ngc` (templates too) + spec + e2e tsconfigs
- `pnpm e2e`: Playwright `e2e/**/*.e2e.ts`, projects `phone` and `handheld-4x3`. The `webServer` recreates the `sweep_e2e` database (`e2e/support/reset-db.mts`, same Postgres as `DATABASE_URL`; name override `SWEEP_E2E_DB`), builds the production client and serves it from the real server on :3100. The `setup` project seeds `e2e-<project>@sweep.test` with the create-user script and saves a signed-in `storageState` in `e2e/.auth/`. Set `SWEEP_E2E_REUSE=1` to reuse a running e2e server (never in CI). With reuse the server keeps its in-memory rate limits (30 uploads per hour per user) and the database keeps its runs (the 50-run quota) across runs, so reset the database or restart the server when you hit them. Stay under the server's rate limits: auth 10 non-GET/min per IP, uploads 30/hour per user; create runs with the `runs` fixture, and never sign out through the server in a test. Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if the bundled chromium won't launch.
- Angular CLI MCP server: `angular-cli` in the root `.mcp.json`

## Sweep rules

- Import only `@sweep/core` (main entry). **Never `@sweep/core/parse`**; lint fails if you do. Upload validation happens on the server.
- Wrap the core engine in `computed()` signals (spec §4.12).
- **No raw colors.** Use only the tokens in `src/styles/tokens.css` (`bg-surface`, `text-fg-muted`, `text-missed`, `rounded-card` …). Tailwind's default palette is disabled on purpose.
- Phone portrait is primary (touch targets ≥ 44px). 4:3 landscape uses `(orientation: landscape) and (max-height: 800px)`. Never allow horizontal page scroll.
- Prose is Markdown → sanitized HTML via DOMPurify (spec §6.4). Never bind unsanitized HTML.
- The service worker caches the app shell only, never `/api/*` (`ngsw-config.json` has no `dataGroups`).

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
