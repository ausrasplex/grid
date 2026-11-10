# Grid — stage 1a scaffold

*One Grid. Built Block by Block.*

A modular, self-hosted construction field app (plans, markups, RFIs,
variations…) built in stages. This scaffold contains the **core block
system** and the first two blocks: **Users** and **Companies**.

## Words we use

| Word | Meaning |
|---|---|
| **Grid** | The app. |
| **Core** | What every business always has. Core blocks are marked `required: true` and can't be switched off. Core = sign-in and accounts, the business, team and roles, **Sites & Jobs**, and the app frame (Home, Settings, Store, centre button, search, notifications). See `docs/roadmap.md`. |
| **Block** | A feature that expands the core, e.g. Quotations, Assets, Documents. Each one is a package in `blocks/`. |
| **Store** | The screen (`/b/companies/store`) where a business adds or removes Blocks. Today it's a built-in catalogue of Grid's own Blocks, free on self-hosted. Later the hosted site can charge for some Blocks and list third-party ones. |

## Layout

```
apps/web/              Next.js app: API dispatcher, pages, app shell
packages/core/         Block system (no dependencies): registry, permissions,
                       menu slots, event bus, routing, dispatcher  ← tested
packages/db/           Prisma 7 client, audit log helper, secret encryption
packages/ui/           Shared client helpers (api, useApi) + basic components
blocks/users/         Identity and profile
blocks/companies/     Companies, members, roles, per-company block switches
blocks/sites/         Sites, buildings, levels, Sites list (core)
blocks/projects/      Jobs, Covers, job pages, Jump to search (core)
blocks/photos/        Photos & notes on jobs, offline capture (optional)
prisma/schema/         base + core schema; block schemas are collected here
scripts/               collect-schema.mjs
```

## How blocks work

Each block is a package with:

| File | Purpose |
|---|---|
| `block.ts` | Manifest: id, dependencies, permissions, default role grants, menu items, routes, events |
| `schema.prisma` | Its database tables |
| `service.ts` | Business logic, exported via `index.ts` for blocks that depend on it |
| `routes.ts` | API, mounted at `/api/<blockId>/…` |
| `ui/` | Pages, rendered at `/b/<blockId>/<page>` |

Rules:

- A block may import from blocks it **depends on** (their `index.ts` only), never the other way round.
- Blocks that don't depend on each other talk through **events** (`app().events.emit(...)` / `on: {...}`).
- **Permissions** are `"<block>.<thing>.<action>"`. Each block says which built-in roles get them by default (`grants`). Owners get everything. Built-in roles are re-synced at server start, so a new block's permissions reach existing companies automatically.
- **Menus** go into slots: `sidebar.main`, `header.actions`, `home.widgets`, `project.tabs`, `plan.toolbar`, `settings.company`, `settings.user`. Items only show when the block is on for the active company and the user has the item's permission.
- **Enforcement is on the server.** The dispatcher refuses calls to switched-off blocks and routes the user lacks permission for. Menus hiding things is just convenience.
- Companies switch optional blocks on/off; a block turns off automatically if something it depends on is off. Core blocks (`required: true`) are always on.

See `docs/ADDING_A_BLOCK.md` for a walkthrough.

## Styling: Tailwind CSS v4 + shadcn/ui, mobile-first

The app is built for phones and tablets first.

- **Tokens** (colours, radius, touch sizes, bar heights) live in `packages/ui/src/styles.css`: hi-vis orange accent, high contrast for sunlight, automatic dark mode.
- **Components** in `packages/ui/src/components/` are shadcn/ui components (Button, Input, Card, Badge, Alert, Switch, Checkbox, Sheet, NativeSelect), adjusted for site use: 44px minimum touch targets (52px for main actions), 16px inputs so iOS doesn't zoom, bigger switches and checkboxes.
- **Building blocks** in `packages/ui/src/blocks.tsx` (`PageHeader`, `ActionButton`, `Section`, `List`, `ListRow`, `TapRow`, `LinkRow`, `Avatar`, `FormActions`, `Grid`, `Stack`, `Loading`, `EmptyState`) carry the layout rules, so blocks don't hand-roll them:
  - **Page headers are compact:** title, then counts/status as a small muted line right under it (`meta`), then an optional one-line description. The page's main action sits to the right of the title on every screen: icon-only on phones, icon + label from 640px (`ActionButton`).
  - **Cards** are rounded and inset from the screen edge, so a strip of background always shows around them.
  - **Phone lists are one line per item** (`TapRow`): tap to open a bottom sheet with that item's details and actions. From 640px, actions sit inline in the row (`ListRow`).
  - Form buttons stack on phones with the main action nearest the thumb; inline from 640px.
  - **md (768px+, tablets):** two-column grids.
- **Rounded, soft look:** 12px corners on buttons and inputs, 20px on cards, 24px on sheets, pill highlights in the nav.
- **App shell** (`apps/web/src/components/ShellNav.tsx`):
  - **Phone:** top bar (company switcher, account) + bottom tab bar (up to 4 items + "More" sheet).
  - **Tablet:** icon rail on the left.
  - **Desktop (1024px+):** full sidebar with labels.
  - Respects notches and home indicators (safe areas).
- **Icons:** lucide. Menu items name an icon from `packages/ui/src/icons.tsx`; add to that map when a block needs a new one.
- Native `<select>` is used on purpose: the phone's own picker beats custom dropdowns on site.

To add more shadcn components later, run the shadcn CLI from `packages/ui` (it reads `packages/ui/components.json`), then check the new file's imports use relative paths like the existing ones.

## Running locally

Needs Node 22.18+, pnpm and a Postgres database.

```bash
cp .env.example .env            # set DATABASE_URL, APP_ENCRYPTION_KEY, BETTER_AUTH_SECRET, BETTER_AUTH_URL
pnpm install
pnpm db:migrate                 # collects block schemas, creates migration, generates client
pnpm typecheck
pnpm test                       # core block-system tests
pnpm dev                        # http://localhost:3000
```

Quote PDFs need Chromium. The Docker image has it; for `pnpm dev` set
`CHROMIUM_PATH` to a local Chromium or Chrome (e.g. `/usr/bin/chromium`).

On a fresh database the sign-in screen offers **Create the first account**.
That account becomes the server admin and goes straight to **Set up your
business** (name, trade, "Just me" or "With a team").

After that the server is **invite-only** (`SIGNUP_MODE=invite`): new people
get in through an invite from a business. Invited people sign in with an
emailed link, then can add a password under Settings › Sign-in & devices.
Until the server admin sets up email (Settings › Email), emails (sign-in links, password resets) are printed to
the server log; in production the link options are hidden until email is
set up, so people sign in with a password.

Test the layout on a real phone too: run `pnpm dev`, then open
`http://<your-computer's-IP>:3000` on the phone (same Wi-Fi). Add that
address to `TRUSTED_ORIGINS` so sign-in accepts it.

## Deploying on Unraid

Install with the two **Unraid templates** in `unraid/` (database, then app). Every setting, TZ included, is a field in the template, so there's no `.env` file to edit. The container applies database updates and makes its own secrets on start, and runs as Unraid's `99:100`. **Step-by-step: `docs/unraid.md`.**

The image is built and published to GitHub Container Registry by `.github/workflows/docker.yml`. `docker-compose.yml` is an alternative for Compose Manager or any Linux box.

## What's built and what's next

Done: block system, users, companies, members, invites (accept/decline),
built-in + custom roles with escalation protection, per-company block
switches with trade presets, company switcher, audit log.

**Build order: solo first, then teams, then multi-company. Agreed: `docs/roadmap.md`.** The phases there replace the old numbered stages; the designs below stay as written.

- **Phase 1 — Solo core + real sign-in (done):** Better Auth (password, sign-in links, password reset, 60-day device sessions, device list), invite-only with first account = server admin, "Just me" setup, solo preset, team features hidden while solo.
- **Phase 2a — Jobs on sites (done):** private sites from a job address, managed sites with buildings and levels, jobs with Covers and job numbers, breadcrumbs with pickers, Sites list, earlier jobs and site notes, /go links, Jump to search. **Design: `docs/stage-2-projects.md`.** 
- **Phase 2b-lite — Photos & notes (done):** per-area photos and notes, before/after, viewer, printable photo report, offline outbox, Take a photo centre button. **Design: `docs/photos-block.md`.**
- **Phase 2c — Storage clean-up (done):** unfiled uploads and Recently deleted cleaned up on a schedule, with restore, Delete now and a history in Settings › Storage. **Design: `docs/photos-block.md`.**
- **Phase 2d — Backups (done):** database and/or media, scheduled or one-click, keep the latest N, download any backup; restore script for the Unraid terminal. **Design: `docs/backups.md`.**
- **Phase 3a — Quotes (done):** tax & currency settings, clients, price book, quick quotes on the phone, branded PDF, email or send yourself, revisions, accept → job. Branding under Settings. **Designs: `docs/quotations-block.md`, `docs/templates-block.md`.**
- **Phase 4a — Plans (done):** upload PDFs (one per sheet or a whole set) or images, Grid reads sheet numbers, titles and revisions for you to check, every revision kept, fast deep-zoom viewer on phone and tablet. **Design: `docs/plans-block.md`.**
- **Phase 4b — Markups, photo pins, measuring.**
- **Phase 3b — Customer signing (done):** private quote link, extras, one-time code, drawn or typed signature, sealed signed PDF with certificate page, verify page, decline online.
- **Phase 4 — Plans, markups, photo pins, measuring.**
- **Phase 5 — Documents & assets.** **Designs: `docs/documents-block.md`, `docs/assets-block.md`.**
- **Phase 6 — Offline sync, notifications, email.**
- **Phase 7 — Teams;** **Phase 8 — Multi-company projects** (stage 2b); **Phase 9 — Inductions & credentials** (`docs/inductions-credentials.md`); then RFIs, revisions, variations, SWMS, reports, hosted site.

Across all stages, navigation is location-first: Site › Building › Level › Project breadcrumbs that each open a picker, project Covers, "Other work areas", self-archiving sites, Jump to search by job/quote/sheet number, and QR/short-link quick routes that work across hosted and self-hosted servers. **Agreed: `docs/navigation.md`.**

Visual style: dark graphite with hi-vis yellow (concept C), flat chrome, simplified home. **Agreed: `docs/visual-style.md`.**

Across all stages: self-hosted now, hosted sign-up site and federation later. **Agreed direction: `docs/deployment-modes.md`.**
