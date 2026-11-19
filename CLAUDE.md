# Grid

*One Grid. Built Block by Block.* A self-hosted construction jobsite app (Fieldwire-like) for Australian trades. Built solo-first (sole trader), then teams, then multi-company jobs with builders. Runs on the owner's Unraid server with Docker; a hosted site and federation come later.

The owner is a worker electrician, not a full-time developer. Explain changes in plain English, use Australian spelling and dates (en-AU), and keep trade wording real (job, site, level, sparky, test & tag).

## Words

- **Grid**: the app. **Block**: a feature package in `blocks/` (was "module"; never use that word). **Store**: where a business adds/removes Blocks (`/business/store`).
- **Core** (`required: true`, can't be switched off): sign-in and accounts, business/team/roles, **Clients**, **Sites & Jobs**, and the app frame (Home, Settings, Store, centre button, Jump to search, notifications). Everything else is an optional Block.

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
apps/web/      Next.js app: shell, sign-in, API dispatcher (/api/<block>/…), pages (/<address>/…, the Block id or its `address`, e.g. /jobs)
  src/blocks.ts        the list of Blocks in this build
  src/lib/auth.ts      Better Auth setup; lib/session.ts is the only place that asks who's signed in
  src/lib/context.ts   builds the RequestContext (user, company, permissions, Blocks, solo)
packages/core/ Block system: defineBlock, registry, permissions, menus, events, routing (tested)
packages/db/   Prisma client, audit(), secret encryption
packages/ui/   Shared components, icons, styles (concept C tokens)
blocks/        users, companies, clients, credentials, sites, projects, signatures, templates (core); photos, quotes, plans, markups, documents, signoffs (optional)
prisma/        base, core and auth schemas; migrations
```

## Rules

- **Self-hosting is through Unraid Docker templates** (`unraid/grid.xml`, guide `docs/unraid.md`). Every environment variable Grid reads must be a field in that template and in `.env.example`, in the same change; `pnpm test` (`scripts/env.test.mjs`) fails otherwise. But only start-up and server set-up things are environment variables (database, addresses, secrets, folders). Settings an admin changes day to day live only in the app (`ServerSetting` or the company's settings), with defaults in code: never both. The email server is one of these (Settings › Email); passwords in settings are stored with `encryptSecret()`.

- **Everything is company-scoped.** Services take the RequestContext and only touch `ctx.companyId`. Never trust an id from the URL to pick the company. (The one exception: a person's own tickets and licences, `credentials`, are scoped to `ctx.userId`.)
- **Permissions are checked on the server** (route `permission`), as `"<block>.<thing>.<action>"`. Menus hiding things is only convenience. Each Block's `grants` set the built-in roles' defaults.
- **Blocks import only from Blocks they depend on**, via that Block's `index.ts`. Otherwise talk through events.
- **Every change writes the audit log** (`audit()` from `@grid/db`) inside the same transaction. It adds the request's IP and device itself; Settings › Activity shows it. Add new `entityType`s to `blocks/companies/activity-words.ts` if the camelCase split doesn't read well.
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
  **Phase 5a** (`credentials` Block, core: **Wallet** (was My tickets & licences) at `/wallet`, photos, encrypted numbers, expiry badges, the Home card and 7 am reminder emails) is done too; see "Phase 5a" in `docs/roadmap.md`. Block jobs can have a `schedule`; Home has a `home.top` panel slot.
  **Phase 5b part 1** (`documents` Block: libraries, job documents and folders, versions, the PDF page viewer, pin to a job, Recently deleted; Office and CSV uploads in `/api/files`) is done too; see "What 5b part 1 built" in `docs/documents-block.md`.
  **Phase 5b part 2** (spreadsheet viewer: Excel, ODS and CSV read once by SheetJS into per-sheet JSON in the cache; tabs, frozen header row and first column, search, filter and sort, row cards, header row per version) is done too; see "What 5b part 2 built" in `docs/documents-block.md`.
  **Sharpness levels** (Settings › Plans & PDFs, server admin: Low/Medium/High/Extreme for plans, Low/Medium/High for documents and quote PDFs; a plan sheet can have its own level; Redraw existing) are done too; see "Sharpness" in `docs/plans-block.md`.
  **Phase 2e parts 1–2** (job Storage section, the Jobs table at /jobs, Archive and Restore job with copies drawn again for a day when opened) are done too; see "Job storage" in `docs/stage-2-projects.md`. A Block with files for jobs adds a `jobStorage` hook, and a `dropArchivedCopies` clean-up hook if it keeps big copies. **Delete job** (archived jobs, Owners, typed confirmation, Recently deleted first; see "Deleting a job") means a Block holding job data also adds a `purgeProject` clean-up hook.
  **Phase 5b part 3** (the `signoffs` Block, a trial: sign off spreadsheet rows, progress, To do filter, match column so sign-offs follow rows into new versions, offline, Download with sign-offs; the viewer's `documents.sheet` slot in `@grid/ui` sheet-slot) is done too; see "What 5b part 3 built" in `docs/documents-block.md`.
  **Phase 5b part 4** (search inside documents: PDF text by pdftotext and spreadsheet cell text into PostgreSQL full-text search, Inside documents results opening at the page, find on page in the PDF viewer) is done too, which finishes Phase 5b; see "What 5b part 4 built" in `docs/documents-block.md`.
  **Phase 4c part 1** (trade icon library by trade with search, placing icons on plans as ICON markups, numbered versions per job, counts per sheet, level and job, trade layers) is done too; see "What part 1 built" under Phase 4c in `docs/roadmap.md`.
  **Phase 4c part 2** (the quote's Take-off section through the `quote.takeoff` slot, a price book item per icon number, Add to quote and "Take-off changed", Quoting jobs moved along by quote events) is done too; see "What part 2 built" under Phase 4c in `docs/roadmap.md`.
  **Phase 4c part 3** (custom icons built from a shape and letters in Settings › Custom icons, and manuals linked to an icon type at `/documents/icon/<key>`) is done too, which finishes Phase 4c.
- Next: **Phase 5c** (Assets, `docs/assets-block.md`). OCR, product scanning and the product catalogue are later.
- Background work: a block declares `jobs` in its manifest (`"plans.render": { handler }`) and queues with `app().jobs.send(name, data)` (pg-boss, or inline when JOBS=off).
- Things Grid can rebuild go in `cacheRoot()` (`<files>/.cache`): backups and the stray-file sweep skip it.
- PDFs: `renderPdf(await toHtml(<Doc/>))` from `@grid/block-templates`. To show a PDF inside the app (never a new tab: it leaves the installed app), turn it into page pictures with `renderPdfPages()` from `@grid/db` (into `cacheRoot()`) and show them with `PageViewer` from `@grid/ui`. `toHtml` loads `react-dom/server` lazily (Next refuses a static import). Locally set `CHROMIUM_PATH` to a Chromium binary; the image sets it.
- Throw errors with `badRequest`/`forbidden`/`notFound`/`conflict` and check them with `isHttpError()`, never `instanceof` (Blocks can get their own copy of the core module).
- The screens say "job"; the code says "project". Keep it that way.
- The screens say "client", never "customer" (one shared Clients list for jobs and quotes, core `clients` Block).

- In `docs/templates-block.md`, a template is built from **elements**; "Block" always means a Grid feature package.
