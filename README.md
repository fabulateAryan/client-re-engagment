# Signal Monitoring

Watches what clients post on social platforms, detects signals worth reacting to, prioritises
them and turns the best ones into re-engagement messages that a person reviews before they are
emailed.

**Status: Phase 1 (foundation).** The core domain, ports and `MonitorClientsUseCase` are
implemented. Every port is backed by an in-memory fake, so the API runs with no external
services.

## Requirements

- Node.js 24 or later (see `.nvmrc`)
- pnpm 11 (`corepack enable` picks up the version pinned in `package.json`)

## Commands (run from the repository root)

| Task                             | Command                             |
| -------------------------------- | ----------------------------------- |
| Install everything               | `pnpm install`                      |
| Run the API (port 3001)          | `pnpm dev:api`                      |
| Run the web app (port 3000)      | `pnpm dev:web`                      |
| Run both together                | `pnpm dev`                          |
| Run all tests                    | `pnpm test`                         |
| Lint (includes core import rule) | `pnpm lint`                         |
| Type-check                       | `pnpm typecheck`                    |
| Check formatting / fix it        | `pnpm format:check` / `pnpm format` |
| Everything CI should run         | `pnpm check`                        |
| Production build                 | `pnpm build`                        |

`pnpm install` also builds `packages/shared`, which both apps depend on.

Configuration is optional for local development because defaults match the ports above. To
change anything, copy `.env.example` to `.env` at the repository root. Both apps read that one
file, and variables already set in the environment take precedence. The API validates its
variables at startup and refuses to start with a clear list of problems if any are invalid.

## Try it

```bash
pnpm dev            # or dev:api and dev:web in two terminals
curl http://localhost:3001/health
curl -X POST http://localhost:3001/monitoring/run
```

Open http://localhost:3000. The home page shows whether the API is healthy.

The fakes are seeded with invented clients (`fake-seed-data.ts`). The first monitoring run
saves 3 signals. A second run finds none, because last-checked times have moved forward. Data
resets when the API restarts.

## Layout

```
apps/api/src
  core/                 pure TypeScript, no framework or I/O imports
    domain/             entities, enums, value objects, domain errors
    application/        use cases (plain classes that receive ports)
    ports/              abstract classes, also used as Nest injection tokens
  adapters/
    inbound/http/       controllers: GET /health, POST /monitoring/run
    outbound/fakes/     in-memory fakes for every port
    outbound/clock/     real system clock
  config/               env loading and validation (zod)
  app.module.ts         composition root: binds ports to adapters
apps/api/test
  unit/                 use case and config tests
  e2e/                  HTTP tests against the wired app
  architecture/         proves the core import rule is active
apps/web                Next.js App Router, health page only
packages/shared         API response types shared by api and web
```

## Hexagonal rules

- `src/core` may import only other files in `src/core`, using relative paths. ESLint
  (`no-restricted-imports` in `apps/api/eslint.config.mjs`) rejects any package import
  (`@nestjs/*`, HTTP and database clients, Node built-ins) and any path into `adapters/`,
  `config/`, `app.module` or `main`. `test/architecture/core-boundary.spec.ts` checks the
  rule is still working.
- Use cases receive ports through their constructor. They are built in `app.module.ts` with
  `useFactory`, so they carry no Nest decorators.
- All signal sources are collected under the `SIGNAL_SOURCES` token (an array). To add a
  platform, write a class extending `SignalSourcePort` in `adapters/outbound/` and add it to
  that array. Several sources for the same platform are supported. Nothing in `core/` changes.

## Monitoring run behaviour

For each active client, `MonitorClientsUseCase` checks only the platforms the client has a
non-blank handle on, and only if a source is registered for that platform. For each platform:

1. Every source for the platform is called with the platform's last-checked time (`null` if
   it has never been checked).
2. Fetched signals are saved. The repository drops duplicates by platform + external id.
3. The last-checked time is set to when this check **started**, and only if every source and
   the save succeeded. Otherwise the same window is fetched again next run, and de-duplication
   absorbs the overlap.

Errors are recorded per client and platform in the run summary, and the run continues. Only
a failure to list clients aborts the run.

## Tech choices worth knowing

- **TypeScript 6.0, not 7.** TypeScript 7 is the latest release, but typescript-eslint and
  ts-jest do not support it yet. The official NestJS 12 starter also uses 6.0.
- **NestJS 12 is published as ES modules.** The API compiles to CommonJS (`module: nodenext`)
  and loads Nest through Node's built-in `require(esm)`, as the official starter does. Jest
  therefore runs with `--experimental-vm-modules`.
- **ESLint 9, not 10.** `eslint-config-next` depends on React, import and a11y plugins that
  do not yet declare ESLint 10 support. All packages use ESLint 9 so they stay consistent.
- pnpm is told not to run the install script of `@parcel/watcher`, an optional native file
  watcher Jest can use (see `pnpm-workspace.yaml`).

## Web app

`pnpm dev` then open http://localhost:3000. Pages: **Overview** (key figures, latest signals,
signal mix, platform coverage, recent runs), **Signals** (filter by client, platform and type,
paginated), **Runs** (history with per-source problems) and **Clients** (handles and last-checked
times). **Run monitoring** triggers a run from any page. The layout is responsive: sidebar on
desktop, bottom tab bar on phones.

While any source uses demo data, a banner says so. Demo brands are deliberately generic
("Example Client Alpha") so a showcase can never be mistaken for real client data.

## LinkedIn via Monid

Monid (https://monid.ai/docs/api/overview) is a gateway to many data providers, so the
LinkedIn data comes from whichever Monid endpoint we choose. The adapter is split so only one
file depends on that choice:

- `monid-http-client.ts`: auth, run and poll, timeouts, retries with backoff, 429 and
  Retry-After, and the documented run statuses. Endpoint-agnostic.
- `linkedin-endpoint-profile.ts`: the input builder, item mapping, signal-type table and the
  fields kept in `raw` for the chosen endpoint. Registered in `linkedin-profiles.ts`.
- `monid-linkedin.source.ts`: the `SignalSourcePort` for LINKEDIN.

To go live:

1. Put `MONID_API_KEY` in the root `.env`.
2. `pnpm monid discover "linkedin company posts"` and `pnpm monid inspect <provider> <endpoint>`
   to pick an endpoint (these do not start runs).
3. Add a profile for it, set `MONID_LINKEDIN_PROVIDER`, `MONID_LINKEDIN_ENDPOINT` and
   `LINKEDIN_SOURCE=monid`, and restart the API.

Data is still held in memory and resets on restart. PostgreSQL and the scheduler are next.

## Real clients and live sources (update)

- **Clients:** put real clients in `clients.local.json` at the repo root (git-ignored; copy
  `clients.local.example.json`). Without it, one invented demo client is used.
  `LINKEDIN` takes the company page URL; `GOOGLE_RSS` (shown as "News") takes the company's
  website domain (best results) or its name.
- **Env:** settings live in `.env.local` (git-ignored, read first) or `.env`. Template: `.env.example`.
- **Live Monid endpoints** (profiles in `apps/api/src/adapters/outbound/monid/profiles/`):
  - LinkedIn: `anyapi /linkedin.company_posts` (company posts only, no reposts).
  - News: `context.dev /news/search` (primary-match articles only, deduped by story).
- `pnpm monid run <provider> <endpoint> '<input-json>' <out-file>` starts a **paid** run and
  saves the raw output for mapping work. Keep the output file outside the repository.

## Phase 1: brand to engagement message

The Phase 1 goal: if you know the brand and its LinkedIn page, the app gives you timely
signals and an engagement message for each.

1. **Clients > Add brand.** Enter the brand name and its LinkedIn company page (website is
   optional and adds news). Brands are saved to the clients file, so they survive a restart.
2. **Check now** on the brand's card fetches its latest posts (only that brand, so a live
   run costs one brand's worth of Monid calls).
3. **Signals > Draft message** on any card. Edit, save, copy, or start again. The app never
   sends anything; the rep sends the message themselves.

Drafts come from a built-in template by default (`MESSAGE_DRAFTER=template`), which uses only
facts from the post and the brand's own campaign history. `MESSAGE_DRAFTER=claude` uses
Claude Opus 5.5 instead and sends the brand name and post text to Anthropic (not campaign
details), so switch it on only once that is cleared.

Signals and drafts are still held in memory and reset when the API restarts.
