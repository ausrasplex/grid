# Grid

*One Grid. Built Block by Block.* A self-hosted construction jobsite app (Fieldwire-like) for Australian trades. Built solo-first (sole trader), then teams, then multi-company jobs with builders. Runs on the owner's Unraid server with Docker; a hosted site and federation come later.

The owner is a worker electrician, not a full-time developer. Explain changes in plain English, use Australian spelling and dates (en-AU), and keep trade wording real (job, site, level, sparky, test & tag).

## Words

- **Grid**: the app. **Block**: a feature package in `blocks/` (was "module"; never use that word). **Store**: where a business adds/removes Blocks (`/b/companies/store`).
- **Core** (`required: true`, can't be switched off): sign-in and accounts, business/team/roles, **Sites & Jobs**, and the app frame (Home, Settings, Store, centre button, Jump to search, notifications). Everything else is an optional Block.

## Naming (project rule)

Use plain, readable names everyone understands at a glance: `date`, not `d`; `quote`, not `q`; `event`, not `e`; `index`, not `i`; `settings`, not `s`. This applies to variables, parameters, callback arguments (`rows.map((row) => …)`), destructured names and small helper functions. The only short names kept are well-known conventions: `ctx` (RequestContext), `tx` (database transaction), `db`, `id`, `ip`, `api`, `cn` (class names helper), `z` (zod), React `ref`, generic type parameters (`T`), and `_`-prefixed values that are deliberately unused.

## Where the decisions are

Read the relevant doc before building. They are agreed designs, not suggestions.

| Doc | Covers |
|---|---|
| `docs/roadmap.md` | Phases and their order, Phase 1 details (done), expansion rules, Store/core decision |
| `docs/stage-2-projects.md` | Sites → Buildings → Levels, projects, Covers, contract chain. **Phase 2a is next.** |
| `docs/navigation.md` | Breadcrumbs, menus per screen size, centre button (§5a), Jump to search, route codes, one scanner |
| `docs/visual-style.md` | Concept C tokens and layout rules |
| `docs/ADDING_A_BLOCK.md` | How to add a Block, step by step |
| `docs/photos-block.md` | Photos & notes, file storage, the storage clean-up |
| `docs/backups.md` | Backups and restoring |
| `docs/unraid.md` | Installing on Unraid with the templates; every setting |
| `docs/quotations-block.md`, `templates-block.md`, `documents-block.md`, `assets-block.md`, `inductions-credentials.md`, `deployment-modes.md` | Later Blocks |

If something isn't covered, ask rather than invent. When a decision is made, write it into the matching doc in the same change.

## Stack and commands

pnpm 10 monorepo · Node 22.18+ · Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5.9 · Prisma 7 (`prisma-client` generator, adapter-pg) · PostgreSQL · Better Auth 1.7 · Tailwind v4 + shadcn/ui · zod v4.

```bash
cp .env.example .env     # DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, APP_ENCRYPTION_KEY
pnpm install
pnpm db:migrate          # collects block schemas → migration → client
pnpm typecheck && pnpm test
pnpm dev
```

- Prisma needs `DATABASE_URL` set even to validate or generate.
- Each Block's `schema.prisma` is copied into `prisma/schema/block.<id>.prisma` by `pnpm db:collect`. Edit the Block's file, never the copy. Generated client: `packages/db/src/generated` (git-ignored).
- Before finishing a change: `pnpm typecheck`, `pnpm test`, and `pnpm build` must pass. For UI, look at it at phone (390px), tablet (834px) and desktop (1440px) widths.

## Layout

```
apps/web/      Next.js app: shell, sign-in, API dispatcher (/api/<block>/…), pages (/b/<block>/…)
  src/blocks.ts        the list of Blocks in this build
  src/lib/auth.ts      Better Auth setup; lib/session.ts is the only place that asks who's signed in
  src/lib/context.ts   builds the RequestContext (user, company, permissions, Blocks, solo)
packages/core/ Block system: defineBlock, registry, permissions, menus, events, routing (tested)
packages/db/   Prisma client, audit(), secret encryption
packages/ui/   Shared components, icons, styles (concept C tokens)
blocks/        users, companies, sites, projects, signatures, templates (core); photos, quotes, plans, markups (optional)
prisma/        base, core and auth schemas; migrations
```

## Rules

- **Self-hosting is through Unraid Docker templates** (`unraid/grid.xml`, guide `docs/unraid.md`). Every environment variable Grid reads must be a field in that template and in `.env.example`, in the same change; `pnpm test` (`scripts/env.test.mjs`) fails otherwise. But only start-up and server set-up things are environment variables (database, addresses, secrets, folders). Settings an admin changes day to day live only in the app (`ServerSetting` or the company's settings), with defaults in code: never both. The email server is one of these (Settings › Email); passwords in settings are stored with `encryptSecret()`.

- **Everything is company-scoped.** Services take the RequestContext and only touch `ctx.companyId`. Never trust an id from the URL to pick the company.
- **Permissions are checked on the server** (route `permission`), as `"<block>.<thing>.<action>"`. Menus hiding things is only convenience. Each Block's `grants` set the built-in roles' defaults.
- **Blocks import only from Blocks they depend on**, via that Block's `index.ts`. Otherwise talk through events.
- **Every change writes the audit log** (`audit()` from `@grid/db`) inside the same transaction.
- **Solo-first, hide don't fork.** `ctx.solo` = one active member and no pending invites, worked out per request. Team-only menu items use `teamOnly: true`; `soloOnly` and `soloLabel` exist too. While solo, skip assign-to-person and approval steps; never build a separate "solo" version.
- **Store fields for later now** (visibility, listing, chain) even when the UI doesn't use them yet. Nothing gets size limits.
- **Menus:** `prominence: "primary"` (phone bar, rail, sidebar), `"main"` (desktop sidebar), or leave it out (under More).
- **Style (concept C):** dark graphite with hi-vis yellow, flat chrome, borderless cards. Use the theme tokens (`bg-card`, `text-muted-foreground`, `bg-primary`…), never raw colours. Plans and PDFs sit in `.paper` (light). No visible scrollbars below 1024px; use `Scroller` so edges fade when there's more. Touch targets ≥ 44px (`h-touch`).
- **Sign-in** is Better Auth only. Self-hosted is invite-only (`SIGNUP_MODE`); the first account is the server admin.

## Where things stand

- Done: stage 1a (Block system, users, companies, roles, Store, concept C shell), **Phase 1** (Better Auth, "Just me" setup, solo preset, team screens hidden while solo) and **Phase 2a** (sites and jobs, breadcrumbs, Sites list, earlier jobs and site notes, job numbers, route codes and /go links, Jump to search, Home "On site now"). What 2a decided is listed in `docs/stage-2-projects.md` under "What 2a built".
  **Phase 2b-lite** (photos Block: photos and notes per area, before/after, viewer, photo report, offline outbox, Take a photo centre button) is done too; see `docs/photos-block.md`. Core now has file storage (`StoredFile`, `/api/files`) and Block panels (`job.area`).
  **Phase 2c** (storage clean-up: pg-boss runner in `apps/web/src/lib/jobs.ts`, `lib/cleanup.ts`, Settings › Storage, Block `cleanup` hooks) is done too.
  **Phase 2d** (backups: `lib/backups.ts`, Settings › Backups, `scripts/grid-restore.sh`) is done too.
  **Phase 3a** (Quotes Block: tax settings, clients, price book, quick quote, PDF, send, accept → job; templates basics: Branding + PDF renderer) is done too; see "What 3a built" in `docs/quotations-block.md`.
  **Phase 3b** (customer signing: `signatures` core block, public pages/API at `/p/<block>` and `/api/public/<block>`, `/q/<token>`, `/verify`) is done too; see "What 3b built" in `docs/quotations-block.md`.
  **Phase 4a** (Plans block: PDF/image upload with a review of guessed sheet numbers and revisions, deep-zoom tiles rendered in the background, OpenSeadragon viewer, revisions) is done too; see `docs/plans-block.md`.
  **Phase 4b** (`markups` Block: pen, highlighter, text, shapes, arrows, clouds, Undo, length and area with a per-revision scale; photo pins in `photos`; the plan overlay in `@grid/ui` that Blocks draw on through the `plans.viewer` slot) is done too; see "What 4b built" in `docs/plans-block.md`.
- Next: tweaking 4b with the owner, then **Phase 5, Documents & assets** (`docs/documents-block.md`, `docs/assets-block.md`).
- Background work: a block declares `jobs` in its manifest (`"plans.render": { handler }`) and queues with `app().jobs.send(name, data)` (pg-boss, or inline when JOBS=off).
- Things Grid can rebuild go in `cacheRoot()` (`<files>/.cache`): backups and the stray-file sweep skip it.
- PDFs: `renderPdf(await toHtml(<Doc/>))` from `@grid/block-templates`. `toHtml` loads `react-dom/server` lazily (Next refuses a static import). Locally set `CHROMIUM_PATH` to a Chromium binary; the image sets it.
- Throw errors with `badRequest`/`forbidden`/`notFound`/`conflict` and check them with `isHttpError()`, never `instanceof` (Blocks can get their own copy of the core module).
- The screens say "job"; the code says "project". Keep it that way.

- In `docs/templates-block.md`, a template is built from **elements**; "Block" always means a Grid feature package.
